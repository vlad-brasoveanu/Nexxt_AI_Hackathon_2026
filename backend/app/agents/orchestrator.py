"""Orchestrator: plan + state + credit-policy guard.

It loads the case, asks the planner for the next eligible task, dispatches the specialist outside any database
transaction, then persists the board, the timeline step and any source snapshots in one short transaction.
Events (client answer, analyst review, new reference rate) mark the affected agents stale and resume the run.
Budget and deadline bound every segment; when they run out the case is routed to a human, marked incomplete."""
import threading
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from time import perf_counter

from sqlalchemy import func, select, update

from app.agents import board as B
from app.agents import planner
from app.agents.catalog import AGENTS, TASKS, authorize
from app.agents.specialists import RUNNERS
from app.agents.specialists.completeness import draft_message, request_items
from app.core.audit import audit
from app.core.policies import current as current_policy
from app.db import AgentRun, AgentStep, Case, ClientRequest, Document, MarketSnapshot, User, now

ROLE_FOR_LEVEL = {"L1": "credit_analyst", "L2": "risk_officer", "L3": "credit_committee"}


def short(model: str) -> str:
    return model.split("/")[-1].replace("-Instruct", "")


class Orchestrator:
    def __init__(self, factory, settings, sources, models, storage: Path):
        self.factory, self.settings, self.sources, self.models, self.storage = factory, settings, sources, models, storage
        self._locks: dict[str, threading.Lock] = {}
        self._registry = threading.Lock()

    # ------------------------------------------------------------------ labels and shared state
    def mode_label(self) -> str:
        if self.models and self.models.large:
            large, small = self.models.large, self.models.small or self.models.large
            where = "Cloud demo" if large.mode == "cloud" else "Local"
            return f"{where} · {large.name} · {short(large.model)} (mare) / {short(small.model)} (mic) · date sintetice"
        return "Mod determinist · fără AI · date sintetice"

    def evaluation_date(self) -> date:
        return date.fromisoformat(self.settings.evaluation_date) if self.settings.evaluation_date else date.today()

    def market(self, session) -> dict:
        row = session.scalar(select(MarketSnapshot).where(MarketSnapshot.index == "ROBOR3M")
                             .order_by(MarketSnapshot.as_of.desc(), MarketSnapshot.created_at.desc()))
        if row:
            return {"index": row.index, "value_pct": row.value_pct, "as_of": row.as_of, "source": row.source}
        seed = self.sources.market_seed("ROBOR3M")
        latest = max(seed["snapshots"], key=lambda s: s["as_of"])
        return {"index": seed["index"], "value_pct": latest["value_pct"], "as_of": latest["as_of"], "source": seed["source"]}

    # ------------------------------------------------------------------ persistence helpers
    def step(self, session, run, agent, kind, title, status="ok", thought=None, task=None, model=None, duration_ms=None, detail=None):
        seq = (session.scalar(select(func.max(AgentStep.seq)).where(AgentStep.run_id == run.id)) or 0) + 1
        session.add(AgentStep(run_id=run.id, seq=seq, agent=agent, kind=kind, title=title[:300], thought=thought, task=task,
                              status=status, model=model, duration_ms=duration_ms, detail=detail or {}))
        run.updated_at = now()
        return seq

    def save_board(self, run, board):
        run.board = deepcopy(board)  # a new object so SQLAlchemy persists the JSON change

    def add_plan(self, run, items, source):
        plan = list(run.plan or [])
        pending = {p["task"] for p in plan if p["status"] == "pending"}
        for item in items:
            if item["task"] not in pending:
                plan.append({"task": item["task"], "agent": TASKS[item["task"]][0], "why": item["why"], "status": "pending", "source": source})
        run.plan = plan

    def set_plan_status(self, run, task, status):
        plan = [dict(p) for p in run.plan or []]
        for p in plan:
            if p["task"] == task and p["status"] in {"pending", "running"}:
                p["status"] = status
                break
        run.plan = plan

    def store_documents(self, session, run, case, documents):
        for doc, data in documents:
            path = self.storage / doc.id
            path.write_bytes(data)
            path.chmod(0o600)
            session.add(Document(id=doc.id, case_id=case.id, kind=doc.kind, filename=doc.filename, sha256=doc.sha256,
                                 media_type=doc.media_type, pages=doc.pages))
        if documents:
            session.execute(update(Case).where(Case.id == case.id).values(revision=Case.revision + 1))
            session.flush()
            session.refresh(case)
            run.case_revision = case.revision

    # ------------------------------------------------------------------ lifecycle
    def start(self, case_id: str, user) -> str:
        with self.factory.begin() as session:
            case = session.get(Case, case_id)
            from app.api.mutations import claim_case
            claim_case(session, case)
            current = session.scalar(select(AgentRun).where(AgentRun.case_id == case.id).order_by(AgentRun.created_at.desc()))
            if current and (current.status == "RUNNING" or (current.case_revision == case.revision and current.status not in {"FAILED", "DECIDED"})):
                return current.id
            board = B.new_board({"id": case.id}, self.evaluation_date())
            run = AgentRun(case_id=case.id, started_by=user.id, status="RUNNING", case_revision=case.revision,
                           mode_label=self.mode_label(), board=board, plan=[])
            session.add(run)
            session.flush()
            self.step(session, run, "orchestrator", "event", "Dosar preluat: pornesc agenții", "info",
                      thought=f"Mod de procesare: {run.mode_label}.", detail={"case_revision": case.revision})
            audit(session, user, "agents.started", case.id, run_id=run.id, mode=run.mode_label)
            run_id = run.id
        self.kick(run_id)
        return run_id

    def resume(self, session, run, title, detail=None):
        """Called inside the caller's transaction; the caller kicks the run after committing."""
        run.status = "RUNNING"
        run.budget_used = 0
        run.segment_started_at = now()
        self.step(session, run, "orchestrator", "event", title, "info", detail=detail or {})

    def kick(self, run_id: str):
        if self.settings.agent_sync:
            self.work(run_id)
        else:
            threading.Thread(target=self.work, args=(run_id,), daemon=True, name=f"agents-{run_id[:8]}").start()

    def _lock(self, run_id):
        with self._registry:
            return self._locks.setdefault(run_id, threading.Lock())

    def work(self, run_id: str):
        with self._lock(run_id):
            try:
                self.loop(run_id)
            except Exception as exc:  # never leave a run silently stuck in RUNNING
                with self.factory.begin() as session:
                    run = session.get(AgentRun, run_id)
                    run.status, run.error = "FAILED", f"{type(exc).__name__}: {exc}"[:300]
                    self.step(session, run, "orchestrator", "error", "Procesare eșuată — dosarul nu este considerat verificat",
                              "failed", thought=run.error)

    # ------------------------------------------------------------------ the loop
    def load(self, session, run):
        case = session.get(Case, run.case_id)
        docs = [B.Doc(id=d.id, kind=d.kind, filename=d.filename, sha256=d.sha256, pages=d.pages, media_type=d.media_type)
                for d in session.scalars(select(Document).where(Document.case_id == case.id, Document.superseded_by.is_(None)).order_by(Document.created_at))]
        # Re-uploading a filename creates a new source version; historical bytes remain downloadable.
        docs = list({(d.kind, d.filename): d for d in docs}.values())
        board = deepcopy(run.board)
        known = board.setdefault("doc_index", {})
        for d in docs:
            if d.id not in known:
                known[d.id] = d.kind
                if not d.kind.startswith("source_"):
                    B.bump(board, "documents")
                    B.bump(board, f"doc:{d.kind}")
        on = date.fromisoformat(board["evaluation_date"])
        standards = current_policy(session, self.sources, on, case.team)
        market = self.market(session)
        seen = (market["value_pct"], market["as_of"], standards["version"])
        if board.get("market_seen") != list(seen):
            if board.get("market_seen") is not None:
                B.bump(board, "market")
            board["market_seen"] = list(seen)
        board["requests_open"] = session.scalar(select(func.count()).select_from(ClientRequest)
                                                .where(ClientRequest.run_id == run.id, ClientRequest.status.in_(["SENT", "DRAFT"]))) or 0
        env = B.Env(case={"id": case.id, "title": case.title, "revision": case.revision, "meta": dict(case.meta or {})},
                    docs=docs, sources=self.sources, standards=standards, market=market, models=self.models,
                    evaluation_date=on, timeout=self.settings.ai_timeout_seconds)
        if run.status == "RUNNING":
            run.case_revision = case.revision
        return case, env, board

    def loop(self, run_id: str):
        while True:
            with self.factory.begin() as session:
                run = session.get(AgentRun, run_id)
                if run.status != "RUNNING":
                    return
                case, env, board = self.load(session, run)
                elapsed = (datetime.now(timezone.utc) - run.segment_started_at.replace(tzinfo=timezone.utc)).total_seconds()
                if run.budget_used >= self.settings.agent_budget or elapsed > self.settings.agent_deadline_seconds:
                    B.issue(board, "orchestrator:budget", "orchestrator", "warning", "Analiză incompletă: buget sau timp epuizat",
                            f"{run.budget_used} sarcini în {elapsed:.0f} s. Decidentul vede dosarul marcat incomplet.", [])
                    self.save_board(run, board)
                    self.step(session, run, "orchestrator", "event", "Buget epuizat: rutez dosarul la om, marcat incomplet", "warning")
                    self.route(session, run, board, incomplete=True)
                    return
                group = planner.eligible_group(board)
                if not group:
                    self.save_board(run, board)
                    run.status = "WAITING_CLIENT"
                    return
                order = [t for t in board.get("plan_order", []) if t in group]
                self.save_board(run, board)
                planned = None if order else (board, env, group)
            if planned:
                result = planner.order(*planned)   # may call the large model: outside any transaction
                with self.factory.begin() as session:
                    run = session.get(AgentRun, run_id)
                    board = deepcopy(run.board)
                    board["plan_order"] = [p["task"] for p in result["plan"]]
                    for proposal in result["outside"]:
                        allowed, why = authorize(proposal["task"], set(group))
                        if proposal["task"] in TASKS and proposal["task"] not in group:
                            self.step(session, run, "guard", "refused", f"{proposal['task']} — ignorată: nu este eligibilă acum", "warning",
                                      thought=why, task=proposal["task"])
                        else:
                            board["security"]["refused_actions"] += 1
                            self.step(session, run, "guard", "refused", f"{proposal['task']} — BLOCAT DE POLITICĂ", "refused",
                                      thought=why, task=proposal["task"], detail={"proposed_by": "orchestrator (model)", "why": proposal["why"]})
                            audit(session, session.get(User, run.started_by), "guard.refused", run.case_id, run_id=run.id, task=proposal["task"])
                    if len(group) > 1 or result["model"]:
                        title = ("Plan: " if not result["deterministic"] else "Plan implicit: ") + " → ".join(p["task"] for p in result["plan"])
                        self.step(session, run, "orchestrator", "plan", title, "ok" if not result["deterministic"] else "info",
                                  thought=result["thought"], model=result["model"], detail={"plan": result["plan"]})
                    self.add_plan(run, result["plan"], "model" if not result["deterministic"] else "implicit")
                    self.save_board(run, board)
                continue
            task = order[0]
            if task == "route.decision":
                with self.factory.begin() as session:
                    run = session.get(AgentRun, run_id)
                    case, env, board = self.load(session, run)
                    self.route(session, run, board)
                return
            if task == "client.request":
                self.send_request(run_id)
                return
            self.dispatch(run_id, task)

    def dispatch(self, run_id: str, task: str):
        agent = TASKS[task][0]
        with self.factory.begin() as session:
            run = session.get(AgentRun, run_id)
            case, env, board = self.load(session, run)
            board["agents"][agent]["status"] = "running"
            self.set_plan_status(run, task, "running")
            self.save_board(run, board)
            self.step(session, run, "orchestrator", "dispatch", f"{AGENTS['orchestrator'].title} → {AGENTS[agent].title}", "info", task=task,
                      thought=next((p["why"] for p in reversed(run.plan) if p["task"] == task), None))
        started = perf_counter()
        work = deepcopy(board)
        try:
            report = RUNNERS[task](work, env)
            failure = None
        except Exception as exc:
            report, failure = None, f"{type(exc).__name__}: {exc}"[:300]
        elapsed = round((perf_counter() - started) * 1000, 1)
        with self.factory.begin() as session:
            run = session.get(AgentRun, run_id)
            case = session.get(Case, run.case_id)
            if case.revision != env.case["revision"]:
                self.step(session, run, "orchestrator", "event", "Documentele s-au schimbat în timpul analizei; rezultatul intermediar este ignorat.", "warning")
                return
            run.budget_used += 1
            if failure:
                board = deepcopy(run.board)
                board["agents"][agent]["status"] = "failed"
                self.save_board(run, board)
                self.set_plan_status(run, task, "skipped")
                run.status, run.error = "FAILED", failure
                self.step(session, run, agent, "error", f"{AGENTS[agent].title} a eșuat — dosarul nu este considerat verificat", "failed",
                          thought=failure, task=task, duration_ms=elapsed)
                return
            self.store_documents(session, run, case, report.documents)
            for doc, _ in report.documents:
                work.setdefault("doc_index", {})[doc.id] = doc.kind
            for challenge in work["challenges"]:
                if challenge["status"] == "open" and challenge["task"] == task and agent != "critic":
                    challenge["status"] = "addressed"
            if task in work.get("plan_order", []):
                work["plan_order"].remove(task)
            if work["agents"][agent]["status"] == "running":
                work["agents"][agent]["status"] = "done"
            if agent == "policy" and work.get("recommendation"):
                run.recommendation = work["recommendation"]
                run.level = work["recommendation"]["level"]
            self.save_board(run, work)
            self.set_plan_status(run, task, "done")
            kind = "challenge" if agent == "critic" and report.status == "warning" else "result"
            self.step(session, run, agent, kind, report.title, report.status, thought=report.thought, task=task,
                      model=report.model, duration_ms=report.duration_ms or elapsed, detail=report.detail)

    def send_request(self, run_id: str):
        with self.factory.begin() as session:
            run = session.get(AgentRun, run_id)
            case, env, board = self.load(session, run)
            items = request_items(board)
        message, model = draft_message(env, items)   # the small model may phrase it; outside the transaction
        with self.factory.begin() as session:
            run = session.get(AgentRun, run_id)
            board = deepcopy(run.board)
            rounds = session.scalar(select(func.count()).select_from(ClientRequest).where(ClientRequest.case_id == run.case_id)) or 0
            request = ClientRequest(case_id=run.case_id, run_id=run.id, round=rounds + 1, status="DRAFT",
                                    channel="Portal client (simulat)", message=message, items=items)
            session.add(request)
            for i in board["issues"]:
                if i.get("client_action") and i["status"] == "open":
                    i["status"] = "requested"
            board["requests_open"] = 1
            B.bump(board, "requests")
            run.budget_used += 1
            self.save_board(run, board)
            self.set_plan_status(run, "client.request", "done")
            if "client.request" in board.get("plan_order", []):
                board["plan_order"].remove("client.request")
            run.status = "WAITING_CLIENT"
            self.step(session, run, "completeness", "request",
                      f"Ciornă de cerere consolidată pentru verificare (runda {rounds + 1}): {len(items)} {'element' if len(items) == 1 else 'elemente'}",
                      "info", task="client.request", model=model, thought=" · ".join(i["title"] for i in items),
                      detail={"items": [i["title"] for i in items], "channel": request.channel})
            audit(session, session.get(User, run.started_by), "client_request.drafted", run.case_id, run_id=run.id, items=len(items))

    def route(self, session, run, board, incomplete=False):
        rec = board.get("recommendation") or run.recommendation
        run.status = "AWAITING_DECISION"
        run.level = (rec or {}).get("level")
        self.save_board(run, board)
        self.set_plan_status(run, "route.decision", "done")
        role = ROLE_FOR_LEVEL.get(run.level or "", "—")
        self.step(session, run, "orchestrator", "event",
                  f"Rutat la decidentul uman: nivel {run.level or '—'} ({role})" + (" · analiză incompletă" if incomplete else ""),
                  "warning" if incomplete else "ok", task="route.decision",
                  thought=(rec or {}).get("level_reason"), detail={"incomplete": incomplete})
        audit(session, session.get(User, run.started_by), "agents.routed", run.case_id, run_id=run.id, level=run.level)
