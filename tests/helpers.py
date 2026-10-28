import json


def packet(client, variant="clean"):
    case = client.post("/api/v1/cases", json={"title": "Dosar sintetic — Atelier Demo SRL"}).json()
    cid, revision = case["id"], case["revision"]
    source_values = [("application", [("company_identifier", "company", "12345678")]),
                     ("company_extract", [("company_identifier", "company", "87654321" if variant == "mismatch" else "12345678"), ("extract_date", "company", "2026-09-01")]),
                     ("identity", [("identity_expiry", "person", "2025-01-01" if variant == "expired" else "2030-01-01")])]
    facts = []
    for kind, values in source_values:
        if variant == "missing_identity" and kind == "identity":
            continue
        text = "DOCUMENT SINTETIC — FĂRĂ VALOARE JURIDICĂ\n" + "\n".join(f"{field}: {value}" for field, _, value in values)
        response = client.post(f"/api/v1/cases/{cid}/documents", data={"kind": kind, "expected_revision": revision}, files={"file": (f"{kind}.json", json.dumps({"pages": [text]}).encode(), "application/json")})
        assert response.status_code == 201, response.text
        doc, revision = response.json()["document"], response.json()["revision"]
        for field, entity, value in values:
            start = text.index(value)
            facts.append({"id": f"{kind}-{field}", "entity_id": entity, "field": field, "value": value,
                          "evidence": {"document_id": doc["id"], "sha256": doc["sha256"], "page": 1, "start": start, "end": start + len(value), "quote": value}})
    imported = client.post(f"/api/v1/cases/{cid}/facts", json={"expected_revision": revision, "facts": {"facts": facts}})
    assert imported.status_code == 201, imported.text
    return cid, imported.json()["revision"], facts


def run(client, cid, revision, key="test-run"):
    return client.post(f"/api/v1/cases/{cid}/runs", json={"expected_revision": revision, "evaluation_date": "2026-10-28"}, headers={"Idempotency-Key": key})
