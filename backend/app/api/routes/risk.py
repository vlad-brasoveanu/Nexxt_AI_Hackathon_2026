"""Version-bound simulations; no external model, no lending decision side effects."""
import sqlite3
from fastapi import APIRouter, HTTPException, Request
from pydantic import Field
from sqlalchemy import select
from app.core.contracts import Contract
from app.api.deps import Auth, DB
from app.api.routes.agents import visible, credit_case
from app.core.audit import audit
from app.db import RiskReport
from app.api.agent_views import latest_run
from app.risk.planner import build

router=APIRouter(prefix='/api/v1',tags=['risk-planner'])


class ScenarioRequest(Contract):
    cfads_drop_pct: float = Field(default=10,ge=0,le=80,allow_inf_nan=False)
    rate_shock_pp: float | None = Field(default=None,ge=0,le=20,allow_inf_nan=False)


@router.post('/agent-runs/{run_id}/risk-planner',status_code=201)
def simulate(run_id: str, body: ScenarioRequest, request: Request, identity: Auth, session: DB):
    run,case=visible(session,identity[0],run_id)
    if run.case_revision!=case.revision or run.status not in {'AWAITING_DECISION','WAITING_CLIENT'}:
        raise HTTPException(409,'Reanalizați dosarul înainte de simulare.')
    _,env,board=request.app.state.orchestrator.load(session,run)
    if run.recommendation and env.standards['version']!=run.recommendation['policy_version']:
        raise HTTPException(409,'Politica s-a schimbat; reanalizați dosarul.')
    try:
        report=build(board,env,body.cfads_drop_pct,body.rate_shock_pp,request.app.state.settings.history_path)
    except (OSError,ValueError,sqlite3.Error):
        raise HTTPException(503,'Istoricul nu este disponibil sau valid; nu folosim date de substituție.')
    report['run_id']=run.id
    report['run_updated_at']=run.updated_at.isoformat()
    item=RiskReport(run_id=run.id,case_id=case.id,actor_id=identity[0].id,report=report)
    session.add(item);session.flush()
    audit(session,identity[0],'risk.simulated',case.id,report_id=item.id,dataset_sha256=report['history']['dataset']['sha256'],
          policy_version=report['policy_version'],assumptions=report['assumptions'])
    session.commit()
    return {'id':item.id,'created_at':item.created_at,**report}


@router.get('/cases/{case_id}/risk-reports')
def reports(case_id: str, identity: Auth,session: DB):
    case=credit_case(session,identity[0],case_id)
    latest=latest_run(session,case_id)
    return [{'id':r.id,'created_at':r.created_at,**r.report,
             'is_current':bool(latest and latest.id==r.run_id and latest.updated_at.isoformat()==r.report.get('run_updated_at') and r.report['case_revision']==case.revision)}
            for r in session.scalars(select(RiskReport).where(RiskReport.case_id==case_id).order_by(RiskReport.created_at.desc()).limit(20))]
