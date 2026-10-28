from sqlalchemy import select
from app.db import PolicyVersion


def current(session,sources,on,team):
    row=session.scalar(select(PolicyVersion).where(PolicyVersion.team==team).order_by(PolicyVersion.created_at.desc()))
    return row.policy if row else sources.standards(on)
