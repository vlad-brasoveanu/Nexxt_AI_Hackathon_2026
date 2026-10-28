"""Live HTTP smoke test on SYNTHETIC data; creates one fresh Codeforge case.
Run: .venv/bin/python scripts/demo/verify_credit.py --url http://127.0.0.1:8000
Writes operational timings to .runtime/credit-smoke.json. It does not invent a human manual baseline.
"""
import argparse
import json
import time
from pathlib import Path
import httpx
from credit_seed import CASES,request_body


def verify(url):
    started=time.perf_counter()
    with httpx.Client(base_url=url,timeout=60) as c:
        def call(method,path,**kwargs):
            r=c.request(method,'/api/v1'+path,**kwargs)
            if r.is_error:raise RuntimeError(f'{method} {path}: HTTP {r.status_code}')
            return r.json()
        def login(username):
            s=call('POST','/session',json={'username':username,'password':'12345'})
            c.headers['x-csrf-token']=s['csrf_token']
        def wait(run):
            deadline=time.monotonic()+300
            while run['status']=='RUNNING':
                if time.monotonic()>deadline:raise RuntimeError('Agent deadline exceeded')
                time.sleep(.15)
                run=call('GET',f"/agent-runs/{run['id']}")
            if run['status']=='FAILED':raise RuntimeError('Agent processing failed')
            return run
        login('officer')
        folder=CASES/'codeforge-digital';manifest=json.loads((folder/'manifest.json').read_text())
        case=call('POST','/cases',json=request_body('codeforge-digital',manifest));cid=case['id'];revision=case['revision']
        for f in manifest['documente']:
            p=folder/f['fisier']
            r=call('POST',f'/cases/{cid}/documents',data={'kind':f['tip_document'],'expected_revision':revision},files={'file':(p.name,p.read_bytes(),f['media_type'])})
            revision=r['revision']
        run=wait(call('POST',f'/cases/{cid}/agent-runs'))
        assert run['status']=='WAITING_CLIENT' and run['requests'][-1]['status']=='DRAFT'
        rid=run['requests'][-1]['id'];call('POST',f'/client-requests/{rid}/send')
        call('POST',f'/client-requests/{rid}/simulate-response')
        run=wait(call('POST',f'/cases/{cid}/agent-runs'))
        assert run['status']=='AWAITING_DECISION' and run['recommendation']['decision']=='COUNTER_OFFER'
        assert all(f['evidence']['quote']==f['value'] for f in run['board']['facts'])
        assert call('POST',f"/agent-runs/{run['id']}/risk-planner",json={})['recommended'] is None
        run=call('POST',f"/agent-runs/{run['id']}/review",json={'accept_all_verified':True})
        assert run['review_complete']
        planner=call('POST',f"/agent-runs/{run['id']}/risk-planner",json={})
        assert planner['recommended'] and planner['history']['n']==30
        # Demonstrate correction -> deterministic recomputation -> re-review.
        fact=next(f for f in run['board']['facts'] if f['id']=='fs2025-revenue')
        corrected=wait(call('POST',f"/agent-runs/{run['id']}/review",json={'decisions':[{'fact_id':fact['id'],'action':'correct','value':'7.800.000','reason':'Verificare demonstrativă a recalculării indicatorilor.'}]}))
        assert next(m for m in corrected['board']['metrics'] if m['id']=='revenue_2025')['value']==7800000
        run=call('POST',f"/agent-runs/{run['id']}/review",json={'accept_all_verified':True})
        login('risk')
        decision=call('POST',f'/cases/{cid}/decision',json={'run_id':run['id'],'action':'APPROVE'})
        assert decision['status']=='FINAL' and not decision['demo_exception']
        login('admin')
        audit=call('GET',f'/admin/audit?case_id={cid}')['items']
        assert any(e['action']=='credit.decision' for e in audit)
        result={'synthetic':True,'case_id':cid,'mode':run['mode_label'],'facts':len(run['board']['facts']),
                'comparables':planner['history']['n'],'observed_outcomes':planner['history']['observed_n'],
                'decision':decision['action'],'approved_amount_ron':decision['terms']['amount'],
                'automated_smoke_seconds':round(time.perf_counter()-started,2),'human_manual_baseline_seconds':None,
                'checks':['PDF upload','draft/manual send','manual rerun','source evidence','complete review','history/scenarios','correction/recalculation','separate human decision','audit']}
        output=Path('.runtime/credit-smoke.json');output.parent.mkdir(exist_ok=True);output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
        print(json.dumps(result,indent=2,ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:8000')
    verify(parser.parse_args().url)
