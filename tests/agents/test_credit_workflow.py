"""End-to-end multi-agent credit workflow on the synthetic fixtures (deterministic mode unless a scripted model is
injected). Agents run inline (agent_sync) so every assertion sees the finished segment."""
import json
from pathlib import Path

import pytest

from app.ai import ModelRouter
from app.ai.provider import Completion, InferenceError
from app.db import AgentRun
from helpers import login

CASES = Path(__file__).resolve().parents[2] / "fixtures" / "credit" / "cases"
pytestmark = pytest.mark.skipif(not (CASES / "codeforge-digital" / "manifest.json").is_file(), reason="credit fixtures not generated")


def credit_case(client, slug):
    manifest = json.loads((CASES / slug / "manifest.json").read_text(encoding="utf-8"))
    c, r = manifest["client"], manifest["cerere_credit"]
    body = {"title": c["denumire"], "kind": "credit", "credit": {
        "company": c["denumire"], "cui": c["cui"], "caen": c["caen"], "founded": c.get("data_infiintarii", ""),
        "request_id": manifest.get("cerere", ""), "product": r["produs"], "amount": int(r["suma_ron"]), "term_months": int(r["durata_luni"]),
        "purpose": r["scop"], "collateral": r.get("garantii", []), "secured": bool(r.get("garantat")), "fixture": slug}}
    case = client.post("/api/v1/cases", json=body)
    assert case.status_code == 201, case.text
    cid, revision = case.json()["id"], case.json()["revision"]
    for f in manifest["documente"]:
        path = CASES / slug / f["fisier"]
        up = client.post(f"/api/v1/cases/{cid}/documents", data={"kind": f["tip_document"], "expected_revision": revision},
                         files={"file": (path.name, path.read_bytes(), f["media_type"])})
        assert up.status_code == 201, up.text
        revision = up.json()["revision"]
    return cid


def start(client, cid):
    run = client.post(f"/api/v1/cases/{cid}/agent-runs")
    assert run.status_code == 201, run.text
    return run.json()


def as_user(client, name):
    login(client, name)


def metric(run, id):
    return next(m for m in run["board"]["metrics"] if m["id"] == id)


def answered(client, run):
    request_id = run["requests"][-1]["id"]
    response = client.post(f"/api/v1/client-requests/{request_id}/simulate-response")
    assert response.status_code == 200, response.text
    return response.json()


def ready_codeforge(client):
    cid = credit_case(client, "codeforge-digital")
    run = start(client, cid)
    return cid, answered(client, run)


def test_codeforge_consolidated_request_critic_and_counter_offer(client):
    cid = credit_case(client, "codeforge-digital")
    run = start(client, cid)
    assert run["status"] == "WAITING_CLIENT", [s["title"] for s in run["steps"]]
    # One consolidated request with both missing documents, sent automatically through the simulated portal.
    assert len(run["requests"]) == 1
    titles = " ".join(i["title"] for i in run["requests"][0]["items"])
    assert "2024" in titles and "evaluare" in titles.lower()
    # The critic contested the cash-flow conclusion with the KYB finding, and the cash-flow agent re-ran.
    assert any(s["kind"] == "challenge" and s["agent"] == "critic" for s in run["steps"])
    cashflow = next(a for a in run["agents"] if a["id"] == "cashflow")
    assert cashflow["runs"] == 2
    assert abs(metric(run, "turnover_gap_pct")["value"]) <= 10
    assert metric(run, "group_exposure")["value"] == 800000
    assert any("afiliat" in n["flags"] for n in run["board"]["kyb"]["nodes"])

    run = answered(client, run)
    assert run["status"] == "AWAITING_DECISION", [s["title"] for s in run["steps"]][-8:]
    rec = run["recommendation"]
    assert rec["decision"] == "COUNTER_OFFER" and rec["proposed"]["amount"] == 3440000 and rec["level"] == "L2"
    assert round(rec["proposed"]["dscr"], 2) >= 1.20 and rec["proposed"]["ltv_pct"] <= 70
    assert run["board"]["security"]["injections"], "the valuation report's hidden instruction must be detected"
    assert run["board"]["memo"]["unverified"] == []
    assert len(run["requests"]) == 1, "no second round: the client answered everything"
    # Every published fact quotes a stored document version.
    assert all(f["verified"] and f["evidence"]["quote"] == f["value"] for f in run["board"]["facts"])


def test_human_decision_needs_review_authority_and_signs(client):
    cid, run = ready_codeforge(client)
    as_user(client, "risk_officer")
    body = {"run_id": run["id"], "action": "APPROVE", "human_seconds": 95}
    assert client.post(f"/api/v1/cases/{cid}/decision", json=body).status_code == 409   # facts not reviewed yet
    as_user(client, "analyst")
    reviewed = client.post(f"/api/v1/agent-runs/{run['id']}/review", json={"accept_all_verified": True})
    assert reviewed.status_code == 200, reviewed.text
    as_user(client, "credit_analyst")
    assert client.post(f"/api/v1/cases/{cid}/decision", json=body).status_code == 403   # L1 cannot sign an L2 case
    as_user(client, "analyst")
    assert client.post(f"/api/v1/cases/{cid}/decision", json=body).status_code == 403   # not a credit role
    as_user(client, "risk_officer")
    decided = client.post(f"/api/v1/cases/{cid}/decision", json=body)
    assert decided.status_code == 201, decided.text
    d = decided.json()
    assert d["status"] == "FINAL" and d["action"] == "APPROVE" and not d["override"] and d["terms"]["amount"] == 3440000
    assert "3.440.000" in d["letter"] and "rămâne o acțiune umană" in d["letter"]
    final = client.get(f"/api/v1/agent-runs/{run['id']}").json()
    assert final["status"] == "DECIDED" and final["steps"][-1]["agent"] == "human"


def test_override_needs_reason_and_two_committee_votes(client):
    cid, run = ready_codeforge(client)
    as_user(client, "analyst")
    client.post(f"/api/v1/agent-runs/{run['id']}/review", json={"accept_all_verified": True})
    full = {"run_id": run["id"], "action": "MODIFY", "terms": {"amount": 3900000, "term_months": 60}}
    as_user(client, "risk_officer")
    assert client.post(f"/api/v1/cases/{cid}/decision", json={**full, "reason": "Clientul are contracte noi semnate."}).status_code == 403
    as_user(client, "committee_a")
    assert client.post(f"/api/v1/cases/{cid}/decision", json=full).status_code == 422   # no reason
    first = client.post(f"/api/v1/cases/{cid}/decision", json={**full, "reason": "Contracte noi semnate cu Hanse Logistik pentru 2027."})
    assert first.status_code == 201 and first.json()["status"] == "PENDING_SECOND_VOTE"
    assert client.post(f"/api/v1/cases/{cid}/decision", json={**full, "reason": "Același membru votează din nou."}).status_code == 409
    as_user(client, "committee_b")
    second = client.post(f"/api/v1/cases/{cid}/decision", json={**full, "reason": "De acord cu excepția, cu garanție suplimentară."})
    assert second.status_code == 201 and second.json()["status"] == "FINAL" and second.json()["override"]
    assert len(second.json()["votes"]) == 2


def test_four_eyes_blocks_reviewer_from_deciding(client, app):
    cid, run = ready_codeforge(client)
    as_user(client, "analyst")
    client.post(f"/api/v1/agent-runs/{run['id']}/review", json={"accept_all_verified": True})
    with app.state.session_factory.begin() as db:
        from app.db import User
        officer = db.query(User).filter_by(username="risk_officer").one()
        stored = db.get(AgentRun, run["id"])
        stored.board = {**stored.board, "reviewed_by": stored.board["reviewed_by"] + [officer.id]}
    as_user(client, "risk_officer")
    response = client.post(f"/api/v1/cases/{cid}/decision", json={"run_id": run["id"], "action": "APPROVE"})
    assert response.status_code == 403 and "patru ochi" in response.json()["detail"]


def test_new_reference_rate_reprices_waiting_case(client):
    cid, run = ready_codeforge(client)
    published = client.post("/api/v1/market/snapshots", json={"value_pct": 6.05})
    assert published.status_code == 201 and published.json()["reevaluated"] == 1
    after = client.get(f"/api/v1/agent-runs/{run['id']}").json()
    assert after["status"] == "AWAITING_DECISION"
    assert after["recommendation"]["proposed"]["amount"] == 3420000
    assert after["recommendation"]["market"]["value_pct"] == 6.05
    assert any("ROBOR 3M nou" in s["title"] for s in after["steps"])


def test_what_if_reports_policy_and_level(client):
    cid, run = ready_codeforge(client)
    ok = client.post(f"/api/v1/agent-runs/{run['id']}/what-if", json={"amount": 3440000, "term_months": 60}).json()
    assert ok["passes"] and ok["level"] == "L2"
    too_much = client.post(f"/api/v1/agent-runs/{run['id']}/what-if", json={"amount": 3900000, "term_months": 60}).json()
    assert not too_much["passes"] and too_much["level"] == "L3"


def test_bureau_knockout_recommends_decline_at_l1(client):
    cid = credit_case(client, "transport-rapid-dunarea")
    run = start(client, cid)
    assert run["status"] == "AWAITING_DECISION", [s["title"] for s in run["steps"]][-6:]
    assert run["recommendation"]["decision"] == "DECLINE" and run["recommendation"]["level"] == "L1"
    assert any(r["code"] == "R-BUREAU-90D" for r in run["recommendation"]["reasons"])
    as_user(client, "analyst")
    client.post(f"/api/v1/agent-runs/{run['id']}/review", json={"accept_all_verified": True})
    as_user(client, "credit_analyst")
    d = client.post(f"/api/v1/cases/{cid}/decision", json={"run_id": run["id"], "action": "REJECT"})
    assert d.status_code == 201 and d.json()["status"] == "FINAL" and not d.json()["override"]


def test_cui_mismatch_becomes_a_client_clarification(client):
    cid = credit_case(client, "nordic-timber-solutions")
    run = start(client, cid)
    assert run["status"] == "WAITING_CLIENT"
    items = " ".join(i["title"] for i in run["requests"][0]["items"])
    assert "codului unic de înregistrare" in items
    assert any(c["rule_id"] == "CON-02" and c["outcome"] == "FAIL" for c in run["board"]["kyb"]["kyc_checks"])


def test_guard_test_and_events_stream(client):
    cid = credit_case(client, "transport-rapid-dunarea")
    run = start(client, cid)
    red = client.post(f"/api/v1/agent-runs/{run['id']}/red-team").json()
    assert red["steps"][-1]["status"] == "refused" and red["board"]["security"]["refused_actions"] == 1
    with client.stream("GET", f"/api/v1/agent-runs/{run['id']}/events?after=0") as stream:
        text = "".join(stream.iter_text())
    assert "event: step" in text and "event: end" in text


class Scripted:
    """A fake provider: answers by recognising the agent prompt. Tests only — never a fallback."""
    name, mode = "scripted", "cloud"

    def __init__(self, model, plan_extra=(), memo_text=None):
        self.model, self.plan_extra, self.memo_text, self.calls = model, list(plan_extra), memo_text, []

    def complete(self, messages, *, timeout):
        system = messages[0]["content"]
        self.calls.append(system[:30])
        if "Orchestratorul" in system:
            eligible = [t["task"] for t in json.loads(messages[1]["content"])["ELIGIBILE"]]
            plan = [{"task": t, "why": "test"} for t in self.plan_extra + list(reversed(eligible))]
            text = json.dumps({"thought": "Încep cu KYB ca să știu grupul înainte de fluxuri.", "plan": plan})
        elif "notă de credit" in system:
            if self.memo_text is None:
                raise InferenceError("scripted failure")
            text = self.memo_text
        elif "Extragi valori" in system:
            text = '{"items": {"revenue": "9.999.999"}}'   # a hallucinated value: must be rejected
        else:
            text = "Bună ziua"
        return Completion(text=text, provider=self.name, model=self.model, latency_ms=1.0)


def test_model_plan_is_guarded_and_hallucinations_are_rejected(client, app):
    large = Scripted("scripted-large", plan_extra=["loan.approve"], memo_text="DSCR-ul este 2,5x, deci creditul este sigur.")
    small = Scripted("scripted-small")
    app.state.orchestrator.models = ModelRouter(large=large, small=small)
    cid = credit_case(client, "codeforge-digital")
    run = start(client, cid)
    refused = [s for s in run["steps"] if s["status"] == "refused"]
    assert refused and refused[0]["task"] == "loan.approve" and "BLOCAT" in refused[0]["title"]
    plan_steps = [s for s in run["steps"] if s["kind"] == "plan" and s["model"]]
    assert plan_steps and plan_steps[0]["model"]["tier"] == "large"
    financial = next(s for s in run["steps"] if s["agent"] == "financials" and s["kind"] == "result")
    assert financial["model"]["tier"] == "small" and financial["detail"]["rejected"][0]["value"] == "9.999.999"
    assert metric(run, f"revenue_2025")["value"] == 7900000
    run = answered(client, run)
    memo = run["board"]["memo"]
    assert memo["model"] is None and memo["rejected_drafts"] == 2 and "2,5" not in memo["text"]
    assert run["status"] == "AWAITING_DECISION"
