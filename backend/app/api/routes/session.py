from datetime import timedelta
import secrets

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from app.api.deps import DB, Auth
from app.api.schemas import Login
from app.core.audit import audit
from app.core.security import DUMMY_HASH, SESSION_COOKIE, passwords, token_hash
from app.db import SessionToken, User, now

router = APIRouter(prefix="/api/v1/session", tags=["session"])


def user_json(user):
    return {"id": user.id, "username": user.username, "role": user.role}


@router.post("")
def login(body: Login, request: Request, response: Response, session: DB):
    user = session.scalar(select(User).where(User.username == body.username))
    valid = passwords.verify(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Invalid credentials")
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    session.add(SessionToken(token_hash=token_hash(token), user_id=user.id, csrf=csrf, expires_at=now() + timedelta(hours=8)))
    audit(session, user, "session.created")
    session.commit()
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=request.app.state.settings.secure_cookies, samesite="strict", max_age=28800)
    return {"user": user_json(user), "csrf_token": csrf}


@router.get("")
def me(identity: Auth):
    user, record = identity
    return {"user": user_json(user), "csrf_token": record.csrf}


@router.delete("", status_code=204)
def logout(response: Response, identity: Auth, session: DB):
    session.delete(identity[1])
    session.commit()
    response.delete_cookie(SESSION_COOKIE)
