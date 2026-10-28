"""Load rendered documents into the live API as cases, with source-verified facts and a check run."""
from uuid import uuid4

import httpx

EVALUATION_DATE = "2026-10-28"


def locate(pages, label):
    """Find the literal value printed after an observation label in the server-extracted text."""
    for number, text in enumerate(pages, 1):
        at = text.find(label)
        if at >= 0:
            start = at + len(label)
            end = start
            while end < len(text) and not text[end].isspace():
                end += 1
            return number, start, end, text[start:end]
    raise ValueError(f"Label {label!r} not found in extracted text")


def seed(plan, url, username, password, use_ai=False):
    with httpx.Client(base_url=url, timeout=300) as client:
        def request(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            if response.is_error:
                raise SystemExit(f"{method} {path} → {response.status_code}: {response.text}")
            return response.json()

        session = request("POST", "/api/v1/session", json={"username": username, "password": password})
        client.headers["x-csrf-token"] = session["csrf_token"]
        for c, entries in plan:
            case = request("POST", "/api/v1/cases", json={"title": f"{c['name']} · {c['scenario']}"})
            prefix = f"/api/v1/cases/{case['id']}"
            revision, facts = case["revision"], []
            for index, (kind, path, observations) in enumerate(entries):
                uploaded = request("POST", prefix + "/documents", data={"kind": kind, "expected_revision": revision},
                                   files={"file": (path.name, path.read_bytes(), "application/pdf")})
                doc, revision = uploaded["document"], uploaded["revision"]
                for field, entity, label in observations:
                    number, start, end, value = locate(doc["pages"], label)
                    facts.append({"id": f"{index}-{field}-{entity}", "field": field, "entity_id": entity, "value": value,
                                  "evidence": {"document_id": doc["id"], "sha256": doc["sha256"], "page": number,
                                               "start": start, "end": end, "quote": value}})
            note = ""
            if use_ai:
                # AI proposes facts from the PDFs; compare with the known values, then confirm the proposal.
                proposal = request("POST", prefix + "/extractions")
                if proposal["status"] != "COMPLETED":
                    raise SystemExit(f"{c['name']}: extraction failed: {proposal['error']}")
                expected = {(f["field"], f["value"]) for f in facts}
                got = {(f["field"], f["value"]) for f in proposal["facts"]["facts"]}
                note = (f" · AI {len(expected & got)}/{len(expected)} correct, {len(got - expected)} extra,"
                        f" {len(proposal['rejected'])} rejected, {proposal['latency_ms'] / 1000:.1f}s")
                payload = proposal["facts"]
            else:
                payload = {"facts": facts}
            revision = request("POST", prefix + "/facts", json={"expected_revision": revision, "facts": payload})["revision"]
            run = request("POST", prefix + "/runs", json={"expected_revision": revision, "evaluation_date": EVALUATION_DATE},
                          headers={"Idempotency-Key": str(uuid4())})
            disposition = run["result"]["disposition"]
            mark = "ok" if disposition == c["expected"] else f"EXPECTED {c['expected']}"
            print(f"{c['name']:<38} {len(entries)} docs · {disposition} ({mark}){note}")
