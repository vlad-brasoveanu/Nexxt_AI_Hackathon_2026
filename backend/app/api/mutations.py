"""Optimistic write claim: concurrent review/decision cannot overwrite each other."""
from fastapi import HTTPException
from sqlalchemy import update
from app.db import AgentRun, now


def claim_run(session,run):
    expected=run.updated_at
    stamp=now()
    result=session.execute(update(AgentRun).where(AgentRun.id==run.id,AgentRun.updated_at==expected,AgentRun.status==run.status)
                           .values(updated_at=stamp).execution_options(synchronize_session=False))
    if result.rowcount!=1:
        raise HTTPException(409,'Analiza a fost modificată simultan; reîncărcați dosarul.')
    run.updated_at=stamp


def claim_case(session,case):
    from app.db import Case
    result=session.execute(update(Case).where(Case.id==case.id,Case.revision==case.revision)
                           .values(revision=case.revision).execution_options(synchronize_session=False))
    if result.rowcount!=1:
        raise HTTPException(409,'Documentele au fost modificate simultan; reîncărcați dosarul.')
