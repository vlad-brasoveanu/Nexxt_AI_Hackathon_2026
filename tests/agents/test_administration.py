from fastapi.testclient import TestClient
from sqlalchemy import select
from app.db import User,AgentRun
from helpers import login
from test_credit_workflow import ready_codeforge,as_user,credit_case,start,answered


def test_user_admin_invalidates_sessions_and_audits(client,app):
    assert client.get('/api/v1/admin/users').status_code==403
    as_user(client,'admin')
    created=client.post('/api/v1/admin/users',json={'username':'new_officer','password':'test-password-only-123','role':'case_officer','reason':'Cont pentru fluxul demonstrativ.'})
    assert created.status_code==201,created.text
    target=created.json()
    with TestClient(app) as other:
        login(other,'new_officer')
        changed=client.patch('/api/v1/admin/users/'+target['id'],json={'expected_revision':1,'role':'case_officer','active':False,'reason':'Dezactivare cont demonstrativ.'})
        assert changed.status_code==200
        assert other.get('/api/v1/session').status_code==401
    audit=client.get('/api/v1/admin/audit?action=user.changed').json()['items']
    assert audit[0]['details']['before']['active'] is True and audit[0]['details']['after']['active'] is False
    assert 'password' not in str(audit)
    stale=client.patch('/api/v1/admin/users/'+target['id'],json={'expected_revision':1,'role':'case_officer','active':True,'reason':'Altă modificare concurentă.'})
    assert stale.status_code==409


def test_policy_change_invalidates_analysis(client):
    cid,run=ready_codeforge(client)
    as_user(client,'admin')
    p=client.get('/api/v1/admin/policies').json()['current']
    body={k:p['thresholds'][k] for k in ['dscr_min','dscr_stressed_min','net_debt_ebitda_max','ltv_max_pct']}
    body.update(expected_version=p['version'],reason='Prag nou pentru demonstrarea politicii.',dscr_min=1.3)
    response=client.post('/api/v1/admin/policies',json=body)
    assert response.status_code==201,response.text
    assert cid in response.json()['requires_reanalysis']
    assert client.post('/api/v1/admin/policies',json=body).status_code==409
    assert not client.get(f"/api/v1/agent-runs/{run['id']}").json()['is_current']
    assert client.post(f"/api/v1/agent-runs/{run['id']}/risk-planner",json={}).status_code==409


def test_demo_admin_exception_requires_server_and_explicit_reason(client,app):
    as_user(client,'admin')
    cid,run=ready_codeforge(client)
    body={'run_id':run['id'],'action':'APPROVE','demo_exception':True,'reason':'Demonstrație explicită fără efect operațional.'}
    assert client.post(f'/api/v1/cases/{cid}/decision',json=body).status_code==403
    app.state.settings.demo_admin_override=True
    assert client.post(f'/api/v1/cases/{cid}/decision',json=body).status_code==409
    client.post(f"/api/v1/agent-runs/{run['id']}/review",json={'accept_all_verified':True})
    assert client.post(f'/api/v1/cases/{cid}/decision',json={**body,'demo_exception':False}).status_code==403
    result=client.post(f'/api/v1/cases/{cid}/decision',json=body)
    assert result.status_code==201,result.text
    assert result.json()['demo_exception'] and 'EXCEPȚIE DEMO' in result.json()['letter']


def test_concurrent_run_write_claim(app,client):
    from app.api.mutations import claim_run
    from fastapi import HTTPException
    import pytest
    cid,run=ready_codeforge(client)
    with app.state.session_factory() as first, app.state.session_factory() as second:
        a=first.get(AgentRun,run['id']);b=second.get(AgentRun,run['id'])
        claim_run(first,a);first.commit()
        with pytest.raises(HTTPException) as err:claim_run(second,b)
        assert err.value.status_code==409
