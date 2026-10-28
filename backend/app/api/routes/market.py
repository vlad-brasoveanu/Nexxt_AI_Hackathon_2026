"""Reference rates and the policy version in force. Publishing a new fixing (a simulated feed tick in the demo)
re-evaluates every case waiting for a decision: the policy agent re-prices it automatically, humans still decide."""
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.api.deps import DB, Auth
from app.api.schemas import MarketPublish
from app.core.audit import audit
from app.credit.numbers import fmt_pct
from app.db import AgentRun, Case, MarketSnapshot

router = APIRouter(prefix="/api/v1/market", tags=["market"])


def state(request, session):
    orchestrator, sources = request.app.state.orchestrator, request.app.state.sources
    current = orchestrator.market(session)
    seed = sources.market_seed("ROBOR3M")
    rows = [{"value_pct": r.value_pct, "as_of": r.as_of, "source": r.source}
            for r in session.scalars(select(MarketSnapshot).where(MarketSnapshot.index == "ROBOR3M"))]
    rows += [{"value_pct": s["value_pct"], "as_of": s["as_of"], "source": seed["source"]} for s in seed["snapshots"]]
    history = sorted(rows, key=lambda r: r["as_of"], reverse=True)
    return {**current, "policy_version": sources.standards(orchestrator.evaluation_date())["version"], "history": history}


@router.get("")
def get_market(request: Request, identity: Auth, session: DB):
    return state(request, session)


@router.post("/snapshots", status_code=201)
def publish(body: MarketPublish, request: Request, identity: Auth, session: DB):
    user = identity[0]
    from app.core.permissions import role
    if role(user) != "admin":
        raise HTTPException(403, "Read-only role")
    orchestrator = request.app.state.orchestrator
    as_of = (body.as_of or orchestrator.evaluation_date()).isoformat()
    previous = orchestrator.market(session)
    session.add(MarketSnapshot(index="ROBOR3M", value_pct=round(body.value_pct, 2), as_of=as_of,
                               source="Fixing publicat manual în demo (simulare feed BNR)", published_by=user.id))
    waiting = list(session.scalars(select(AgentRun).join(Case, Case.id == AgentRun.case_id)
                                   .where(Case.team == user.team, AgentRun.status == "AWAITING_DECISION")))
    for run in waiting:
        orchestrator.resume(session, run, f"ROBOR 3M nou: {fmt_pct(body.value_pct, 2)} la {as_of} (anterior {fmt_pct(previous['value_pct'], 2)}) "
                                          "→ re-evaluare automată a politicii", {"previous": previous["value_pct"], "value": body.value_pct})
    audit(session, user, "market.published", None, index="ROBOR3M", value_pct=body.value_pct, as_of=as_of, reevaluated=len(waiting))
    session.commit()
    for run in waiting:
        orchestrator.kick(run.id)
    return {**state(request, session), "reevaluated": len(waiting)}

