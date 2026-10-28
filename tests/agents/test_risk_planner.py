from copy import deepcopy
from app.risk.history import load,compare
from test_credit_workflow import ready_codeforge,as_user


def test_dataset_and_no_outcome_leakage():
    data=load()
    assert data['total']==6000 and data['romania']==3726 and data['excluded']==0
    applicant={'ebitda_margin_pct':20,'current_ratio':1.4,'revenue_growth_pct':5,'years_in_business':8}
    before=compare(data,'6201','Credit de investiții IMM',applicant)
    modified=deepcopy(data)
    for row in modified['rows']:row['outcome']='INSOLVENCY'
    after=compare(modified,'6201','Credit de investiții IMM',applicant)
    assert [r['case_id'] for r in before['comparables']]==[r['case_id'] for r in after['comparables']]
    assert before['n']==30 and all(r['country']=='RO' and r['currency']=='EUR' for r in before['comparables'])
    assert before['outcomes']!=after['outcomes']
    assert compare(data,'9999','Credit de investiții IMM',applicant)['n']==0
    assert compare(data,'6201','Credit de investiții IMM',{})['n']==0


def test_planner_review_and_stress(client):
    cid,run=ready_codeforge(client)
    url=f"/api/v1/agent-runs/{run['id']}/risk-planner"
    before=client.post(url,json={})
    assert before.status_code==201,before.text
    assert before.json()['recommended'] is None and before.json()['blockers']
    as_user(client,'analyst')
    client.post(f"/api/v1/agent-runs/{run['id']}/review",json={'accept_all_verified':True})
    after=client.post(url,json={})
    assert after.status_code==201,after.text
    report=after.json()
    assert report['recommended'] and report['history']['n']==30
    for s in report['scenarios']:
        assert s['terms']['amount']<=3900000
        assert s['stressed']['dscr_stressed']<=s['terms']['dscr_stressed']
    assert client.get(f'/api/v1/cases/{cid}/risk-reports').json()[0]['id']==report['id']
    assert client.post(url,json={'cfads_drop_pct':101}).status_code==422
    as_user(client,'outsider')
    assert client.get(f'/api/v1/cases/{cid}/risk-reports').status_code==404


def test_future_outcomes_are_censored_after_matching():
    from datetime import date
    data=load()
    applicant={'ebitda_margin_pct':20,'current_ratio':1.4,'revenue_growth_pct':5}
    early=compare(data,'6201','Credit de investiții IMM',applicant,date(2026,10,29))
    late=compare(data,'6201','Credit de investiții IMM',applicant,date(2040,1,1))
    assert [r['case_id'] for r in early['comparables']]==[r['case_id'] for r in late['comparables']]
    assert early['unobserved_n']>0 and late['unobserved_n']==0
    assert early['observed_n']+early['unobserved_n']==early['n']
    assert all(r['months_to_event'] is None for r in early['comparables'] if r['outcome']=='UNOBSERVED')


def test_stress_and_unavailable_history_are_not_favorable(client,app,tmp_path):
    cid,run=ready_codeforge(client)
    as_user(client,'analyst')
    client.post(f"/api/v1/agent-runs/{run['id']}/review",json={'accept_all_verified':True})
    url=f"/api/v1/agent-runs/{run['id']}/risk-planner"
    stressed=client.post(url,json={'cfads_drop_pct':80}).json()
    assert stressed['recommended'] is None and all(not s['eligible'] for s in stressed['scenarios'])
    corrupt=tmp_path/'invalid.db';corrupt.write_bytes(b'not sqlite')
    app.state.settings.history_path=str(corrupt)
    assert client.post(url,json={}).status_code==503
