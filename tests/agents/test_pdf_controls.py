from io import BytesIO
from copy import deepcopy
from pypdf import PdfWriter
from app.agents import board as B
from app.agents.document_checks import inspect
from app.agents.specialists.financials import locate
from test_credit_workflow import ready_codeforge, as_user, credit_case, start


def test_scan_returns_actionable_error(client):
    cid = client.post('/api/v1/cases', json={'title':'Scan'}).json()['id']
    out = BytesIO(); writer = PdfWriter(); writer.add_blank_page(width=100, height=100); writer.write(out)
    response = client.post(f'/api/v1/cases/{cid}/documents', data={'kind':'application','expected_revision':0},
                           files={'file':('scan.pdf',out.getvalue(),'application/pdf')})
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'PDF_TEXT_REQUIRED'


def test_same_value_new_evidence_loses_review():
    board = {'facts': {}}
    ev = {'document_id':'one','sha256':'a','page':1,'start':0,'end':1,'quote':'1'}
    B.fact(board,'f','financials','Label','field','1',ev,1)
    board['facts']['f']['review']='accepted'
    B.fact(board,'f','financials','Label','field','1',{**ev,'sha256':'b'},1)
    assert board['facts']['f']['review']=='pending'


def test_parser_never_reads_number_from_next_label():
    doc=B.Doc('a','financial_statements','a.pdf','hash',['Cifra de afaceri netă\nProfit 900.000'])
    assert locate(doc,'revenue','Cifra de afaceri netă') is None


def test_eur_and_thousands_require_review():
    for unit in ['EUR','mii lei']:
        doc=B.Doc('a','financial_statements','2025.pdf','hash',[f'Situații financiare anuale 2025 Firma CUI 123456 sume în {unit}'])
        assert any('Moneda' in x for x in inspect(doc,{'cui':'123456','company':'Firma'}))


def test_partial_review_does_not_authorize_decision(client):
    cid, run=ready_codeforge(client)
    as_user(client,'analyst')
    r=client.post(f"/api/v1/agent-runs/{run['id']}/review",json={'decisions':[{'fact_id':run['board']['facts'][0]['id'],'action':'accept'}]})
    assert r.status_code==200
    as_user(client,'risk_officer')
    assert client.post(f'/api/v1/cases/{cid}/decision',json={'run_id':run['id'],'action':'APPROVE'}).status_code==409


def test_client_request_requires_human_send(client):
    run=start(client,credit_case(client,'codeforge-digital'))
    assert run['requests'][0]['status']=='DRAFT'
    assert client.post(f"/api/v1/client-requests/{run['requests'][0]['id']}/simulate-response").status_code==409


def test_missing_value_cannot_be_next_row_number():
    doc=B.Doc('a','financial_statements','a.pdf','hash',['Cifra de afaceri netă\n06 Alte venituri 900.000'])
    assert locate(doc,'revenue','Cifra de afaceri netă') is None


def test_replacing_pdf_invalidates_review_and_preserves_original(client):
    from pathlib import Path
    cid,run=ready_codeforge(client)
    as_user(client,'analyst')
    client.post(f"/api/v1/agent-runs/{run['id']}/review",json={'accept_all_verified':True})
    detail=client.get(f'/api/v1/cases/{cid}').json()
    old=next(d for d in detail['documents'] if d['filename']=='situatii-financiare-2025.pdf')
    data=Path('fixtures/credit/cases/codeforge-digital/situatii-financiare-2025.pdf').read_bytes()
    response=client.post(f'/api/v1/cases/{cid}/documents',data={'kind':'financial_statements','expected_revision':detail['revision'],'supersedes_document_id':old['id']},files={'file':('corectat-2025.pdf',data,'application/pdf')})
    assert response.status_code==201,response.text
    documents=client.get(f'/api/v1/cases/{cid}').json()['documents']
    assert next(d for d in documents if d['id']==old['id'])['superseded_by']==response.json()['document']['id']
    assert client.get(f"/api/v1/documents/{old['id']}/download").content==data
    rerun=start(client,cid)
    assert rerun['status']=='AWAITING_DECISION' and not rerun['review_complete']
    assert old['id'] not in {f['evidence']['document_id'] for f in rerun['board']['facts']}
