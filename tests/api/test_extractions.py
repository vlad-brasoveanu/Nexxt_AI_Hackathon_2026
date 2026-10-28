import json

import httpx
import pytest

from app.ai import InferenceError
from app.ai.featherless import FeatherlessProvider
from app.ai.provider import Completion
from helpers import login, run

PAGES = {
    "application": "DOCUMENT SINTETIC\nCerere\nCod unic de înregistrare (CUI) 12345678\ncompany_identifier: 12345678",
    "company_extract": "DOCUMENT SINTETIC\nCertificat constatator\ncompany_identifier: 12345678\nData emiterii: 01.09.2026\nextract_date: 2026-09-01",
    "identity": "DOCUMENT SINTETIC\nCarte de identitate\nValabilitate 01.01.2020 – 01.01.2030\nidentity_expiry: 2030-01-01",
}
GOOD = {
    "application": [{"field": "company_identifier", "value": "12345678", "page": 1}],
    "company_extract": [{"field": "company_identifier", "value": "12345678", "page": 1}, {"field": "extract_date", "value": "2026-09-01", "page": 1}],
    "identity": [{"field": "identity_expiry", "value": "2030-01-01", "page": 1}],
}


class FakeProvider:
    name, model, mode = "fake", "fake-model", "cloud"

    def __init__(self, replies=GOOD, error=None):
        self.replies, self.error, self.calls = replies, error, 0

    def complete(self, messages, *, timeout):
        self.calls += 1
        if self.error:
            raise self.error
        kind = messages[1]["content"].split("\n")[0].removeprefix("Tip document: ")
        return Completion(text="```json\n" + json.dumps({"facts": self.replies[kind]}) + "\n```", provider=self.name, model=self.model, latency_ms=12.5)


def upload_case(client):
    case = client.post("/api/v1/cases", json={"title": "Dosar AI"}).json()
    revision = case["revision"]
    for kind, text in PAGES.items():
        response = client.post(f"/api/v1/cases/{case['id']}/documents", data={"kind": kind, "expected_revision": revision},
                               files={"file": (f"{kind}.json", json.dumps({"pages": [text]}).encode(), "application/json")})
        revision = response.json()["revision"]
    return case["id"], revision


def test_ai_proposal_confirmed_and_run(client, app):
    app.state.inference = FakeProvider()
    cid, revision = upload_case(client)
    proposal = client.post(f"/api/v1/cases/{cid}/extractions")
    assert proposal.status_code == 201, proposal.text
    body = proposal.json()
    assert body["status"] == "COMPLETED" and body["rejected"] == [] and body["is_current"]
    assert body["label"] == "Cloud demo · fake · fake-model · date sintetice"
    assert {f["field"] for f in body["facts"]["facts"]} == {"company_identifier", "extract_date", "identity_expiry"}
    confirmed = client.post(f"/api/v1/cases/{cid}/facts", json={"expected_revision": revision, "facts": body["facts"]})
    assert confirmed.status_code == 201, confirmed.text
    assert confirmed.json()["extraction_mode"] == "ai_assisted"
    result = run(client, cid, confirmed.json()["revision"]).json()["result"]
    assert result["disposition"] == "READY_FOR_REVIEW"
    assert result["processing_mode"] == "ai_assisted"
    assert client.get(f"/api/v1/cases/{cid}/extractions/latest").json()["id"] == body["id"]


def test_hallucinated_values_are_rejected(client, app):
    app.state.inference = FakeProvider({**GOOD, "identity": [{"field": "identity_expiry", "value": "2099-12-31", "page": 1}],
                                        "application": [{"field": "iban", "value": "RO49AAAA1B31007593840000"}]})
    cid, _ = upload_case(client)
    body = client.post(f"/api/v1/cases/{cid}/extractions").json()
    assert {f["field"] for f in body["facts"]["facts"]} == {"company_identifier", "extract_date"}
    reasons = {r["field"]: r["reason"] for r in body["rejected"]}
    assert reasons["identity_expiry"] == "Valoarea nu apare exact în document"
    assert "iban" in reasons


def test_provider_failure_is_recorded_not_hidden(client, app):
    app.state.inference = FakeProvider(error=InferenceError("Provider timed out"))
    cid, _ = upload_case(client)
    body = client.post(f"/api/v1/cases/{cid}/extractions").json()
    assert body["status"] == "FAILED" and body["error"] == "Provider timed out" and body["facts"]["facts"] == []


def test_extraction_requires_configured_provider_and_edit_role(client, app):
    app.state.inference = None
    cid, _ = upload_case(client)
    assert client.post(f"/api/v1/cases/{cid}/extractions").status_code == 503
    app.state.inference = FakeProvider()
    login(client, "supervisor")
    assert client.post(f"/api/v1/cases/{cid}/extractions").status_code == 403


def test_featherless_adapter_retries_once_and_sends_key():
    seen = []

    def handler(request):
        seen.append(request)
        if len(seen) == 1:
            return httpx.Response(503)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"facts": []}'}}]})

    provider = FeatherlessProvider("test-key", "m", "https://example.invalid/v1", transport=httpx.MockTransport(handler))
    completion = provider.complete([{"role": "user", "content": "x"}], timeout=5)
    assert completion.text == '{"facts": []}' and completion.provider == "featherless"
    assert len(seen) == 2 and seen[0].headers["authorization"] == "Bearer test-key"
    assert json.loads(seen[0].content)["temperature"] == 0


def test_featherless_adapter_error_does_not_leak_key():
    provider = FeatherlessProvider("secret-key", "m", "https://example.invalid/v1", transport=httpx.MockTransport(lambda r: httpx.Response(401)))
    with pytest.raises(InferenceError) as exc:
        provider.complete([{"role": "user", "content": "x"}], timeout=5)
    assert "secret-key" not in str(exc.value)
