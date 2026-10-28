"""Run a synthetic foundation packet against the live API."""
import argparse
import getpass
import json
from pathlib import Path
from uuid import uuid4
import httpx

parser = argparse.ArgumentParser()
parser.add_argument("fixture", nargs="?", default="fixtures/mismatch.json")
parser.add_argument("--url", default="http://127.0.0.1:8000")
args = parser.parse_args()
packet = json.loads(Path(args.fixture).read_text())
with httpx.Client(base_url=args.url, timeout=30) as client:
    def request(method, path, **kwargs):
        response = client.request(method, path, **kwargs)
        response.raise_for_status()
        return response.json()
    session = request("POST", "/api/v1/session", json={"username": "manager", "password": getpass.getpass("Demo password: ")})
    client.headers["x-csrf-token"] = session["csrf_token"]
    case = request("POST", "/api/v1/cases", json={"title": packet["title"]})
    prefix = f"/api/v1/cases/{case['id']}"
    revision, facts = case["revision"], []
    for index, source in enumerate(packet["documents"]):
        uploaded = request("POST", prefix + "/documents", data={"kind": source["kind"], "expected_revision": revision}, files={"file": (source["kind"] + ".json", json.dumps({"pages": source["pages"]}).encode(), "application/json")})
        doc, revision = uploaded["document"], uploaded["revision"]
        for observation in source["observations"]:
            text = source["pages"][0]
            start = text.index(observation["value"])
            facts.append({**observation, "id": f"{index}-{observation['field']}", "evidence": {"document_id": doc["id"], "sha256": doc["sha256"], "page": 1, "start": start, "end": start + len(observation["value"]), "quote": observation["value"]}})
    revision = request("POST", prefix + "/facts", json={"expected_revision": revision, "facts": {"facts": facts}})["revision"]
    result = request("POST", prefix + "/runs", json={"expected_revision": revision, "evaluation_date": packet["evaluation_date"]}, headers={"Idempotency-Key": str(uuid4())})
    print(json.dumps(result, ensure_ascii=False, indent=2))
    assert result["result"]["disposition"] == packet["expected_disposition"]
