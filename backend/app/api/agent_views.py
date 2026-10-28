"""JSON views of agent runs, steps, client requests and decisions (the contract in frontend/src/lib/agent-types.ts)."""
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.agents import board as B
from app.agents.catalog import AGENTS
from app.db import AgentRun, AgentStep, ClientRequest, CreditDecision, User

CONFLICT_RULES = {"company_identifier": "kyc:CON-02", "extract_date": "kyc:BUS-05", "identity_expiry": "kyc:VAL-01"}


def step_json(step):
    return {"seq": step.seq, "agent": step.agent, "kind": step.kind, "title": step.title, "thought": step.thought, "task": step.task,
            "status": step.status, "model": step.model, "duration_ms": step.duration_ms, "detail": step.detail or {},
            "created_at": step.created_at}


def request_json(r):
    return {"id": r.id, "round": r.round, "status": r.status, "channel": r.channel, "message": r.message, "items": r.items,
            "sent_at": r.sent_at, "answered_at": r.answered_at}


def decision_json(d):
    return {"id": d.id, "action": d.action, "status": d.status, "terms": d.terms, "conditions": d.conditions, "reason": d.reason,
            "override": d.override, "demo_exception": d.demo_exception, "level": d.level, "votes": d.votes, "human_seconds": d.human_seconds, "letter": d.letter,
            "created_at": d.created_at}


def facts_view(board):
    open_keys = {i["key"] for i in B.open_issues(board)}
    out = []
    for f in board["facts"].values():
        year = f["id"][2:6] if f["id"].startswith("fs") else None
        conflict = CONFLICT_RULES.get(f["field"]) in open_keys or (year is not None and f"fs-consistency:{year}" in open_keys)
        note = {"ai_small": "Propus de modelul mic, verificat pe rândul din document",
                "structured": "Extras de parserul structurat"}.get(f.get("method"))
        if f["review"] == "corrected":
            note = f"Corectat de analist: {f.get('corrected_value')}"
        out.append({k: f[k] for k in ("id", "entity_id", "field", "value", "evidence", "agent", "label", "normalized", "verified", "review")}
                   | {"conflict": conflict, "note": note})
    return out


def board_view(board, refused):
    order = list(AGENTS)
    return {
        "facts": facts_view(board),
        "metrics": sorted(board["metrics"].values(), key=lambda m: order.index(m["agent"]) if m["agent"] in order else 99),
        "issues": [{k: v for k, v in i.items() if k != "key"} for i in board["issues"]],
        "rules": board["rules"],
        "financials": board.get("financials"),
        "cashflow": {k: v for k, v in board["cashflow"].items() if k in {"period", "monthly", "classes", "top_clients"}} if board.get("cashflow") else None,
        "kyb": board.get("kyb"),
        "analyst": board.get("analyst"),
        "historical_context": board.get("historical_context"),
        "memo": board.get("memo"),
        "security": {"injections": board["security"]["injections"], "refused_actions": refused},
    }


def agent_cards(board):
    cards = []
    for agent in AGENTS.values():
        state = board["agents"][agent.id]
        status = state["status"]
        if status == "done" and B.stale(board, agent.id) and agent.id != "orchestrator":
            status = "stale"
        cards.append({"id": agent.id, "title": agent.title, "role": agent.role, "status": status, "runs": state["runs"],
                      "tier": agent.tier, "last_summary": state["last_summary"]})
    return cards


def run_json(session, run, case, settings):
    steps = list(session.scalars(select(AgentStep).where(AgentStep.run_id == run.id).order_by(AgentStep.seq)))
    requests = list(session.scalars(select(ClientRequest).where(ClientRequest.run_id == run.id).order_by(ClientRequest.sent_at)))
    decision = session.scalar(select(CreditDecision).where(CreditDecision.run_id == run.id).order_by(CreditDecision.created_at.desc()))
    refused = sum(1 for s in steps if s.status == "refused")
    started = run.segment_started_at.replace(tzinfo=timezone.utc)
    end = datetime.now(timezone.utc) if run.status == "RUNNING" else run.updated_at.replace(tzinfo=timezone.utc)
    preparer = session.get(User, run.started_by)
    recommendation = dict(run.recommendation, superseded=False) if run.recommendation else None
    return {
        "id": run.id, "case_id": run.case_id, "status": run.status, "case_revision": run.case_revision,
        "review_complete": __import__("app.agents.review", fromlist=["complete"]).complete(run.board),
        "reviewed_by": [session.get(User, uid).username for uid in run.board.get("reviewed_by", []) if session.get(User, uid)],
        "is_current": run.case_revision == case.revision, "mode_label": run.mode_label,
        "budget": {"used": run.budget_used, "limit": settings.agent_budget, "deadline_s": settings.agent_deadline_seconds,
                   "elapsed_s": round(max(0.0, (end - started).total_seconds()), 1)},
        "agents": agent_cards(run.board), "plan": [{k: p[k] for k in ("task", "agent", "why", "status")} for p in run.plan or []],
        "steps": [step_json(s) for s in steps], "board": board_view(run.board, refused),
        "recommendation": recommendation, "requests": [request_json(r) for r in requests],
        "decision": decision_json(decision) if decision else None,
        "prepared_by": preparer.username if preparer else None, "error": run.error,
        "created_at": run.created_at, "updated_at": run.updated_at,
    }


def latest_run(session, case_id):
    return session.scalar(select(AgentRun).where(AgentRun.case_id == case_id).order_by(AgentRun.created_at.desc()))


def max_seq(session, run_id):
    return session.scalar(select(func.max(AgentStep.seq)).where(AgentStep.run_id == run_id)) or 0
