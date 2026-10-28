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
