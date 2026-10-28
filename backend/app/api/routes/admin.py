"""Tenant-scoped administration. No deletion of users or audit evidence."""
from copy import deepcopy
from typing import Literal
from fastapi import APIRouter,HTTPException,Request,Query
from pydantic import Field,model_validator,field_validator
from sqlalchemy import select,delete,update,func
from sqlalchemy.exc import IntegrityError
from app.api.deps import Auth,DB
from app.api.routes.session import user_json
from app.core.contracts import Contract
from app.core.permissions import role
from app.core.policies import current
from app.core.security import passwords
from app.core.audit import audit
from app.db import User,SessionToken,AuditEvent,Case,AgentRun,PolicyVersion,uid

router=APIRouter(prefix='/api/v1/admin',tags=['administration'])


def admin(user):
    if role(user)!='admin':raise HTTPException(403,'Doar administratorul poate folosi această funcție.')


class Reasoned(Contract):
    @field_validator('reason',check_fields=False)
    @classmethod
    def meaningful_reason(cls,value):
        if len(value.strip())<10:raise ValueError('Motivul trebuie să conțină minimum 10 caractere utile.')
        return value.strip()


class NewUser(Reasoned):
    username:str=Field(pattern=r'^[a-zA-Z0-9_.-]{3,80}$')
    password:str=Field(min_length=10,max_length=200)
    role:Literal['case_officer','risk_reviewer','admin']
    authority_level:Literal['L1','L2','L3']|None=None
    reason:str=Field(min_length=10,max_length=2000)


class UpdateUser(Reasoned):
    expected_revision:int=Field(ge=1)
    role:Literal['case_officer','risk_reviewer','admin']
    authority_level:Literal['L1','L2','L3']|None=None
    active:bool
    reason:str=Field(min_length=10,max_length=2000)


@router.get('/users')
def users(identity:Auth,session:DB):
    user=identity[0];admin(user)
    rows=list(session.scalars(select(User).where(User.team==user.team).order_by(User.username)))
    return {'users':[user_json(u) for u in rows], 'counts':{r:sum(u.active and role(u)==r for u in rows) for r in ['case_officer','risk_reviewer','admin']}}


@router.post('/users',status_code=201)
def create_user(body:NewUser,identity:Auth,session:DB):
    actor=identity[0];admin(actor)
    user=User(username=body.username,password_hash=passwords.hash(body.password),role=body.role,team=actor.team,
              authority_level=body.authority_level if body.role!='case_officer' else None)
    session.add(user)
    try:session.flush()
    except IntegrityError:
        session.rollback();raise HTTPException(409,'Numele de utilizator este deja folosit.')
    audit(session,actor,'user.created',target_user_id=user.id,before=None,after=user_json(user),reason=body.reason)
    session.commit();return user_json(user)


@router.patch('/users/{user_id}')
def change_user(user_id:str,body:UpdateUser,identity:Auth,session:DB):
    actor=identity[0];admin(actor)
    target=session.get(User,user_id)
    if not target or target.team!=actor.team:raise HTTPException(404,'Utilizator negăsit.')
    if target.id==actor.id and (not body.active or body.role!='admin'):
        raise HTTPException(409,'Nu vă puteți dezactiva sau elimina propriul rol de administrator.')
    before=user_json(target)
    changes={'role':body.role,'active':body.active,'authority_level':body.authority_level if body.role!='case_officer' else None,'revision':body.expected_revision+1}
    result=session.execute(update(User).where(User.id==target.id,User.revision==body.expected_revision).values(**changes))
    if result.rowcount!=1:raise HTTPException(409,'Utilizator modificat între timp; reîncărcați lista.')
    session.execute(delete(SessionToken).where(SessionToken.user_id==target.id))
    session.refresh(target)
    audit(session,actor,'user.changed',target_user_id=target.id,before=before,after=user_json(target),reason=body.reason)
    session.commit();return user_json(target)


@router.get('/audit')
def events(identity:Auth,session:DB,offset:int=Query(0,ge=0),limit:int=Query(50,ge=1,le=100),
           actor_id:str|None=None,case_id:str|None=None,action:str|None=None):
    actor=identity[0];admin(actor)
    query=select(AuditEvent,User.username).join(User,User.id==AuditEvent.actor_id).where(User.team==actor.team)
    if actor_id:query=query.where(AuditEvent.actor_id==actor_id)
    if case_id:query=query.where(AuditEvent.case_id==case_id)
    if action:query=query.where(AuditEvent.action==action)
    rows=session.execute(query.order_by(AuditEvent.created_at.desc(),AuditEvent.id).offset(offset).limit(limit+1)).all()
    return {'items':[{'id':e.id,'actor_id':e.actor_id,'actor':name,'action':e.action,'case_id':e.case_id,'details':e.details,'created_at':e.created_at}
                     for e,name in rows[:limit]],'next_offset':offset+limit if len(rows)>limit else None}


class PublishPolicy(Reasoned):
    expected_version:str=Field(max_length=80)
    reason:str=Field(min_length=10,max_length=2000)
    dscr_min:float=Field(ge=1,le=5,allow_inf_nan=False)
    dscr_stressed_min:float=Field(ge=0.5,le=5,allow_inf_nan=False)
    net_debt_ebitda_max:float=Field(gt=0,le=10,allow_inf_nan=False)
    ltv_max_pct:float=Field(gt=0,le=100,allow_inf_nan=False)
    @model_validator(mode='after')
    def coherent(self):
        if self.dscr_stressed_min>self.dscr_min:raise ValueError('DSCR stresat nu poate depăși pragul de bază.')
        return self


@router.get('/policies')
def policies(request:Request,identity:Auth,session:DB):
    actor=identity[0];admin(actor)
    active=current(session,request.app.state.sources,request.app.state.orchestrator.evaluation_date(),actor.team)
    rows=session.scalars(select(PolicyVersion).where(PolicyVersion.team==actor.team).order_by(PolicyVersion.created_at.desc()).limit(30))
    from app.api.agent_views import latest_run
    stale=[(c.id,c.title) for c in session.scalars(select(Case).where(Case.team==actor.team,Case.kind=='credit'))
           if (r:=latest_run(session,c.id)) and r.status!='DECIDED' and r.case_revision!=c.revision]
    return {'current':active,'versions':[{'version':r.version,'parent_version':r.parent_version,'reason':r.reason,'created_at':r.created_at} for r in rows],
            'requires_reanalysis':[{'id':i,'title':t} for i,t in stale]}


@router.post('/policies',status_code=201)
def publish_policy(body:PublishPolicy,request:Request,identity:Auth,session:DB):
    actor=identity[0];admin(actor)
    before=current(session,request.app.state.sources,request.app.state.orchestrator.evaluation_date(),actor.team)
    if body.expected_version!=before['version']:raise HTTPException(409,'Politica a fost modificată între timp.')
    after=deepcopy(before);after['version']='DEMO-'+uid()[:12]
    for key in ('dscr_min','dscr_stressed_min','net_debt_ebitda_max','ltv_max_pct'):after['thresholds'][key]=getattr(body,key)
    row=PolicyVersion(team=actor.team,version=after['version'],parent_version=before['version'],policy=after,published_by=actor.id,reason=body.reason)
    session.add(row)
    try:session.flush()
    except IntegrityError:
        session.rollback();raise HTTPException(409,'Alt administrator a publicat deja o versiune; reîncărcați.')
    from app.api.agent_views import latest_run
    ids=[c.id for c in session.scalars(select(Case).where(Case.team==actor.team,Case.kind=='credit'))
         if (r:=latest_run(session,c.id)) and r.status!='DECIDED']
    if ids:session.execute(update(Case).where(Case.id.in_(ids)).values(revision=Case.revision+1))
    audit(session,actor,'policy.published',before=before,after=after,reason=body.reason,affected_cases=ids)
    session.commit();return {'version':row.version,'requires_reanalysis':ids}
