from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import DB, Auth, case_for, editable
from app.api.schemas import NewCase
from app.api.serializers import case_json, doc_json
from app.core.audit import audit
from app.db import Case, Document

router = APIRouter(prefix="/api/v1/cases", tags=["cases"])


@router.post("", status_code=201)
def new_case(body: NewCase, identity: Auth, session: DB):
    user = identity[0]
    editable(user)
    case = Case(title=body.title, owner_id=user.id, team=user.team)
    session.add(case)
    session.flush()
    audit(session, user, "case.created", case.id)
    session.commit()
    return case_json(case)


@router.get("")
def list_cases(identity: Auth, session: DB, offset: int = 0):
    user = identity[0]
    if offset < 0:
        raise HTTPException(422, "Offset must be nonnegative")
    query = select(Case).where(Case.team == user.team)
    if user.role == "manager":
        query = query.where(Case.owner_id == user.id)
    return [case_json(c) for c in session.scalars(query.order_by(Case.created_at.desc()).offset(offset).limit(100))]


@router.get("/{case_id}")
def get_case(case_id: str, identity: Auth, session: DB):
    case = case_for(session, identity[0], case_id)
    docs = session.scalars(select(Document).where(Document.case_id == case_id))
    return {**case_json(case), "documents": [doc_json(d) for d in docs]}
