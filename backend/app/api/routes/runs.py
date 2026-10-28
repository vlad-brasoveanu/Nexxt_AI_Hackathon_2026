from hashlib import sha256
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select

from app.api.deps import DB, Auth, case_for, visible_run
from app.api.schemas import RunRequest
from app.api.serializers import run_json
from app.core.audit import audit
from app.core.contracts import Context, FactSet
from app.db import Case, Document, FactSnapshot, Run
from app.engine.runner import execute
from app.ingestion import verify_facts

router = APIRouter(prefix="/api/v1", tags=["runs"])


@router.post("/cases/{case_id}/runs", status_code=201)
def run_case(case_id: str, body: RunRequest, request: Request, identity: Auth, session: DB,
             idempotency_key: Annotated[str, Header(min_length=1, max_length=80)]):
    registry, workflow = request.app.state.registry, request.app.state.workflow
    user = identity[0]
    from app.core.permissions import permissions
    if not permissions(user)["edit_case"]:
        raise HTTPException(403, "Read-only role cannot run checks")
    case = case_for(session, user, case_id)
    key = f"{case_id}:{idempotency_key}"
    request_hash = sha256(body.model_dump_json().encode()).hexdigest()
    # Serialize case mutations and short deterministic runs. Move long model work to leased jobs.
    session.execute(select(Case).where(Case.id == case_id).with_for_update())
    session.refresh(case)
    previous = session.scalar(select(Run).where(Run.request_key == key))
    if previous:
        if previous.request_hash != request_hash:
            raise HTTPException(409, "Idempotency key already used with different inputs")
        return run_json(previous)
    if case.revision != body.expected_revision:
        raise HTTPException(409, "Stale case revision")
    facts = session.scalar(select(FactSnapshot).where(FactSnapshot.case_id == case_id, FactSnapshot.case_revision == case.revision))
    if not facts:
        raise HTTPException(409, "Import verified observations for the current case revision first")
    docs = {d.id: d for d in session.scalars(select(Document).where(Document.case_id == case_id))}
    inputs = FactSet.model_validate(facts.payload)
    verify_facts(inputs, docs)
    context = Context(actor_id=user.id, case_id=case_id, evaluation_date=body.evaluation_date,
                      permissions=frozenset({"case.analyze"}), document_kinds={key: d.kind for key, d in docs.items()})
    result = execute(registry, workflow, context, inputs)
    run = Run(case_id=case_id, case_revision=case.revision, request_key=key, request_hash=request_hash,
              status=result["status"], result=result,
              snapshot={"workflow": workflow.model_dump(mode="json"), "modules": registry.catalogue(),
                        "fact_snapshot_id": facts.id, "evaluation_date": str(body.evaluation_date),
                        "documents": {key: d.sha256 for key, d in docs.items()}})
    session.add(run)
    session.flush()
    audit(session, user, "run.completed", case_id, run_id=run.id, status=run.status)
    session.commit()
    return run_json(run)


@router.get("/cases/{case_id}/runs")
def case_runs(case_id: str, identity: Auth, session: DB):
    case = case_for(session, identity[0], case_id)
    runs = session.scalars(select(Run).where(Run.case_id == case_id).order_by(Run.created_at.desc()).limit(50))
    return [{**run_json(run), "is_current": case.revision == run.case_revision} for run in runs]


@router.get("/runs/{run_id}")
def get_run(run_id: str, identity: Auth, session: DB):
    run, case = visible_run(session, identity[0], run_id)
    return {**run_json(run), "is_current": case.revision == run.case_revision}


@router.get("/runs/{run_id}/findings")
def findings(run_id: str, identity: Auth, session: DB):
    run, case = visible_run(session, identity[0], run_id)
    return {"is_current": case.revision == run.case_revision, "findings": run.result["findings"]}


@router.get("/runs/{run_id}/trace")
def trace(run_id: str, identity: Auth, session: DB):
    run, _ = visible_run(session, identity[0], run_id)
    return run.result["trace"]
