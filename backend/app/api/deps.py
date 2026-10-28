"""Shared request dependencies: database session, authentication and case access rules."""
from datetime import timezone
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.security import SESSION_COOKIE, token_hash
from app.db import Case, Run, SessionToken, User, now


def get_db(request: Request):
    with request.app.state.session_factory() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


def current_identity(request: Request, session: DB):
    token = request.cookies.get(SESSION_COOKIE, "")
    record = session.get(SessionToken, token_hash(token)) if token else None
    if not record or record.expires_at.replace(tzinfo=timezone.utc) <= now():
        raise HTTPException(401, "Authentication required")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and not secrets.compare_digest(request.headers.get("x-csrf-token", ""), record.csrf):
        raise HTTPException(403, "Invalid CSRF token")
    user = session.get(User, record.user_id)
    if not user:
        raise HTTPException(401, "Authentication required")
    return user, record


Auth = Annotated[tuple, Depends(current_identity)]


def case_for(session, user, case_id):
    case = session.get(Case, case_id)
    if not case or case.team != user.team or (user.role == "manager" and case.owner_id != user.id):
        raise HTTPException(404, "Case not found")
    if user.role not in {"manager", "analyst", "supervisor"}:
        raise HTTPException(403, "Role not permitted")
    return case


def editable(user):
    if user.role not in {"manager", "analyst"}:
        raise HTTPException(403, "Role cannot modify case evidence")


def bump(session, case, expected):
    result = session.execute(update(Case).where(Case.id == case.id, Case.revision == expected).values(revision=Case.revision + 1))
    if result.rowcount != 1:
        raise HTTPException(409, "Stale case revision; refresh before retrying")
    session.refresh(case)


def visible_run(session, user, run_id):
    run = session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run, case_for(session, user, run.case_id)
