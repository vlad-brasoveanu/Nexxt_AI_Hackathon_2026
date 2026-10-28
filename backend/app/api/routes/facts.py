from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import DB, Auth, bump, case_for, editable
from app.api.schemas import ImportFacts
from app.core.audit import audit
from app.db import Document, FactSnapshot
from app.ingestion import verify_facts

router = APIRouter(prefix="/api/v1/cases/{case_id}/facts", tags=["facts"])


@router.post("", status_code=201)
def import_facts(case_id: str, body: ImportFacts, identity: Auth, session: DB):
    user = identity[0]
    editable(user)
    case = case_for(session, user, case_id)
    docs = {d.id: d for d in session.scalars(select(Document).where(Document.case_id == case_id))}
    try:
        verify_facts(body.facts, docs)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    bump(session, case, body.expected_revision)
    facts = FactSnapshot(case_id=case_id, case_revision=case.revision, payload=body.facts.model_dump(mode="json"))
    session.add(facts)
    audit(session, user, "facts.imported", case_id, mode=body.facts.extraction_mode, revision=case.revision)
    session.commit()
    return {"id": facts.id, "revision": case.revision, "extraction_mode": body.facts.extraction_mode}


@router.get("")
def current_facts(case_id: str, identity: Auth, session: DB):
    case = case_for(session, identity[0], case_id)
    facts = session.scalar(select(FactSnapshot).where(FactSnapshot.case_id == case_id).order_by(FactSnapshot.created_at.desc()))
    return {"revision": facts.case_revision if facts else None, "is_current": bool(facts and facts.case_revision == case.revision),
            "facts": facts.payload if facts else None}
