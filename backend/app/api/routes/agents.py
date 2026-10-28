"""Agent runs on credit cases: start, follow live (SSE), review the facts, answer the client request (simulated
portal), what-if pricing, and the guard test. Decisions live in routes/credit.py and are human only."""
import json
import time
from copy import deepcopy

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.agents import board as B
from app.agents.catalog import authorize
from app.agents.specialists.policy import inputs_from_board
from app.api.agent_views import facts_view, latest_run, run_json, step_json
from app.api.deps import DB, Auth, case_for, editable
from app.api.routes.documents import store
from app.api.schemas import ReviewRequest, TermsRequest
from app.core.audit import audit
from app.credit import policy as engine
from app.credit.numbers import parse_ro
from app.db import AgentRun, AgentStep, ClientRequest, now

router = APIRouter(prefix="/api/v1", tags=["agents"])


def credit_case(session, user, case_id):
    case = case_for(session, user, case_id)
    if case.kind != "credit":
        raise HTTPException(409, "Agenții de creditare rulează doar pe dosare de credit")
    return case


def visible(session, user, run_id):
    run = session.get(AgentRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run, credit_case(session, user, run.case_id)


@router.post("/cases/{case_id}/agent-runs", status_code=201)
def start(case_id: str, request: Request, identity: Auth, session: DB):
    user = identity[0]
    editable(user)
    case = credit_case(session, user, case_id)
    current = latest_run(session, case_id)
    if current and current.status not in {"DECIDED", "FAILED"}:
        return run_json(session, current, case, request.app.state.settings)
    session.rollback()
    run_id = request.app.state.orchestrator.start(case_id, user)
    session.expire_all()
    return run_json(session, session.get(AgentRun, run_id), case_for(session, user, case_id), request.app.state.settings)


@router.get("/cases/{case_id}/agent-runs/latest")
def latest(case_id: str, request: Request, identity: Auth, session: DB):
    case = credit_case(session, identity[0], case_id)
    run = latest_run(session, case_id)
    if not run:
        raise HTTPException(404, "No agent run for this case yet")
    return run_json(session, run, case, request.app.state.settings)


@router.get("/agent-runs/{run_id}")
def get_run(run_id: str, request: Request, identity: Auth, session: DB):
    run, case = visible(session, identity[0], run_id)
    return run_json(session, run, case, request.app.state.settings)


@router.get("/agent-runs/{run_id}/events")
def events(run_id: str, request: Request, identity: Auth, session: DB, after: int = 0):
    """Server-sent events: `step` for each new timeline step, `run` on status changes, `end` once the run rests."""
    visible(session, identity[0], run_id)
    factory = request.app.state.session_factory

    def stream():
        last, last_status, resting = after, None, 0
        deadline = time.monotonic() + 900
        while time.monotonic() < deadline:
            with factory() as s:
                steps = list(s.scalars(select(AgentStep).where(AgentStep.run_id == run_id, AgentStep.seq > last).order_by(AgentStep.seq)))
                run = s.get(AgentRun, run_id)
                status, updated = run.status, run.updated_at
            for step in steps:
                last = step.seq
                yield f"event: step\ndata: {json.dumps(step_json(step), default=str, ensure_ascii=False)}\n\n"
            if status != last_status:
                last_status = status
                yield f"event: run\ndata: {json.dumps({'status': status, 'updated_at': updated}, default=str)}\n\n"
            resting = resting + 1 if status != "RUNNING" else 0
            if resting >= 2:
                yield "event: end\ndata: {}\n\n"
                return
            yield ": ping\n\n"
            time.sleep(0.4)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})


@router.post("/agent-runs/{run_id}/review")
def review(run_id: str, body: ReviewRequest, request: Request, identity: Auth, session: DB):
    user = identity[0]
    editable(user)
    run, case = visible(session, user, run_id)
    if run.status not in {"AWAITING_DECISION", "WAITING_CLIENT"}:
        raise HTTPException(409, "Agenții lucrează încă la dosar; revizia se face după ce se opresc")
    board = deepcopy(run.board)
    facts = board["facts"]
    counts = {"accepted": 0, "corrected": 0, "rejected": 0}
    conflicts = {f["id"] for f in facts_view(board) if f["conflict"]}
    if body.accept_all_verified:
        for f in facts.values():
            if f["verified"] and f["review"] == "pending" and f["id"] not in conflicts:
                f["review"] = "accepted"
                counts["accepted"] += 1
    changed = False
    for d in body.decisions:
        f = facts.get(d.fact_id)
        if not f:
            raise HTTPException(422, f"Fapt necunoscut: {d.fact_id}")
        if d.action == "accept":
            f["review"] = "accepted"
            counts["accepted"] += 1
        elif d.action == "reject":
            f["review"], changed = "rejected", True
            counts["rejected"] += 1
        else:
            value = parse_ro(d.value or "")
            if value is None:
                raise HTTPException(422, "Valoarea corectată trebuie să fie un număr (format românesc, ex. 1.375.000)")
            f.update(review="corrected", corrected_value=value)
            changed = True
            counts["corrected"] += 1
    board["reviewed_by"] = sorted(set(board.get("reviewed_by", [])) | {user.id})
    pending = sum(1 for f in facts.values() if f["review"] == "pending")
    if changed:
        B.bump(board, "review")
    run.board = board
    title = f"Revizie analist ({user.username}): {counts['accepted']} acceptate, {counts['corrected']} corectate, {counts['rejected']} respinse; {pending} rămase"
    orchestrator = request.app.state.orchestrator
    resume = changed and run.status == "AWAITING_DECISION"
    if resume:
        orchestrator.resume(session, run, title + " → recalculez indicatorii afectați", {"by": user.username, **counts})
    else:
        orchestrator.step(session, run, "human", "event", title, "ok", detail={"by": user.username, **counts})
    audit(session, user, "agents.review", case.id, run_id=run.id, **counts)
    session.commit()
    if resume:
        orchestrator.kick(run.id)
    session.expire_all()
    return run_json(session, session.get(AgentRun, run_id), case_for(session, user, case.id), request.app.state.settings)


def answer(request, session, user, client_request, uploaded):
    run = session.get(AgentRun, client_request.run_id)
    client_request.status, client_request.answered_at = "ANSWERED", now()
    board = deepcopy(run.board)
    for i in board["issues"]:
        if i["status"] == "requested":
            i["status"] = "open"   # the agents re-check each item against what arrived
    board["requests_open"] = 0
    B.bump(board, "requests")
    run.board = board
    request.app.state.orchestrator.resume(session, run, f"Clientul a răspuns prin portal: {len(uploaded)} documente încărcate",
                                          {"documents": uploaded, "request_id": client_request.id})
    audit(session, user, "client_request.answered", run.case_id, request_id=client_request.id, documents=len(uploaded))
    session.commit()
    request.app.state.orchestrator.kick(run.id)
    return run


@router.post("/client-requests/{request_id}/simulate-response")
def simulate_response(request_id: str, request: Request, identity: Auth, session: DB):
    """Demo: the client uploads the requested documents through the portal (files from the case fixture)."""
    user = identity[0]
    editable(user)
    if not request.app.state.settings.demo_simulations:
        raise HTTPException(404, "Simulations are disabled")
    client_request = session.get(ClientRequest, request_id)
    if not client_request:
        raise HTTPException(404, "Request not found")
    case = credit_case(session, user, client_request.case_id)
    if client_request.status != "SENT":
        raise HTTPException(409, "Cererea a primit deja răspuns")
    slug = (case.meta or {}).get("fixture")
    if not slug:
        raise HTTPException(409, "Acest dosar nu are un răspuns simulat al clientului")
    sources = request.app.state.sources
    folder = sources.case_dir(slug)
    uploaded = []
    for f in sources.case_manifest(slug).get("raspuns_client", []):
        path = (folder / f["fisier"]).resolve()
        if folder not in path.parents:
            raise HTTPException(500, "Invalid fixture path")
        store(request, session, user, case, case.revision, f["tip_document"], path.name, f["media_type"], path.read_bytes())
        uploaded.append(path.name)
    client_request = session.get(ClientRequest, request_id)
    run = answer(request, session, user, client_request, uploaded)
    session.expire_all()
    return run_json(session, session.get(AgentRun, run.id), case_for(session, user, case.id), request.app.state.settings)


@router.post("/client-requests/{request_id}/answer")
def mark_answered(request_id: str, request: Request, identity: Auth, session: DB):
    """The client finished uploading through another channel: resume the agents on what arrived."""
    user = identity[0]
    editable(user)
    client_request = session.get(ClientRequest, request_id)
    if not client_request:
        raise HTTPException(404, "Request not found")
    case = credit_case(session, user, client_request.case_id)
    if client_request.status != "SENT":
        raise HTTPException(409, "Cererea a primit deja răspuns")
    run = answer(request, session, user, client_request, [])
    session.expire_all()
    return run_json(session, session.get(AgentRun, run.id), case_for(session, user, case.id), request.app.state.settings)


@router.post("/agent-runs/{run_id}/what-if")
def what_if(run_id: str, body: TermsRequest, request: Request, identity: Auth, session: DB):
    run, case = visible(session, identity[0], run_id)
    orchestrator = request.app.state.orchestrator
    _, env, board = orchestrator.load(session, run)
    session.rollback()
    x = inputs_from_board(board, env)
    if x.cfads is None or not x.ebitda:
        raise HTTPException(409, "Indicatorii financiari nu sunt încă disponibili")
    t = engine.terms_for(env.standards, env.market, x, body.amount, body.term_months)
    level, override, why = engine.required_level(env.standards, run.recommendation or {"decision": "COUNTER_OFFER"}, "MODIFY", t, x.group_exposure)
    return {"amount": t["amount"], "term_months": t["term_months"], "rate_pct": t["rate_pct"], "monthly_payment": t["monthly_payment"],
            "dscr": t["dscr"], "dscr_stressed": t["dscr_stressed"], "ltv_pct": t["ltv_pct"], "passes": t["passes"],
            "level": level, "level_reason": why}


@router.post("/agent-runs/{run_id}/red-team")
def red_team(run_id: str, request: Request, identity: Auth, session: DB):
    """Demo safety test: a forbidden action is submitted to the guard exactly as a compromised planner would."""
    user = identity[0]
    if user.role == "supervisor" or not request.app.state.settings.demo_simulations:
        raise HTTPException(403, "Not permitted")
    run, case = visible(session, user, run_id)
    allowed, why = authorize("loan.approve", set())
    request.app.state.orchestrator.step(session, run, "guard", "refused", "loan.approve — BLOCAT DE POLITICĂ", "refused",
                                        thought=why, task="loan.approve",
                                        detail={"simulated": True, "source": "Test de siguranță (simulare)", "allowed": allowed})
    audit(session, user, "guard.refused", case.id, run_id=run.id, task="loan.approve", simulated=True)
    session.commit()
    return run_json(session, run, case, request.app.state.settings)
