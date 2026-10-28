"""Load the synthetic credit cases (fixtures/credit/cases/*/manifest.json) into the live API: one credit case per
manifest with its intake documents. The agents start from the UI during the demo, or here with --start.

    .venv/bin/python scripts/demo/credit_seed.py            # cases + documents
    .venv/bin/python scripts/demo/credit_seed.py --start    # also start the agents
"""
import argparse
import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "fixtures" / "credit" / "cases"
ORDER = ["transport-rapid-dunarea", "nordic-timber-solutions", "codeforge-digital"]  # newest last: the main case tops the queue


def request_body(slug, manifest):
    client, credit = manifest["client"], manifest["cerere_credit"]
    return {"title": f"{client['denumire']} · {credit['produs']}", "kind": "credit", "credit": {
        "company": client["denumire"], "cui": client["cui"], "caen": client["caen"], "caen_text": client.get("caen_text", ""),
        "founded": client.get("data_infiintarii", ""), "address": client.get("adresa", ""),
        "channel": "sucursală" if manifest.get("canal", "online").startswith("suc") else "online",
        "request_id": manifest.get("cerere", ""), "received_at": manifest.get("primit_la", ""),
        "product": credit["produs"], "amount": int(credit["suma_ron"]), "term_months": int(credit["durata_luni"]),
        "purpose": credit["scop"], "collateral": credit.get("garantii", []), "secured": bool(credit.get("garantat")), "fixture": slug}}


def seed(url, username, password, start):
    with httpx.Client(base_url=url, timeout=600) as client:
        def call(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            if response.is_error:
                raise SystemExit(f"{method} {path} → {response.status_code}: {response.text}")
            return response.json()

        session = call("POST", "/api/v1/session", json={"username": username, "password": password})
        client.headers["x-csrf-token"] = session["csrf_token"]
        for slug in ORDER:
            manifest = json.loads((CASES / slug / "manifest.json").read_text(encoding="utf-8"))
            case = call("POST", "/api/v1/cases", json=request_body(slug, manifest))
            revision = case["revision"]
            for f in manifest["documente"]:
                path = CASES / slug / f["fisier"]
                uploaded = call("POST", f"/api/v1/cases/{case['id']}/documents", data={"kind": f["tip_document"], "expected_revision": revision},
                                files={"file": (path.name, path.read_bytes(), f["media_type"])})
                revision = uploaded["revision"]
            note = ""
            if start:
                run = call("POST", f"/api/v1/cases/{case['id']}/agent-runs")
                note = f" · agents {run['status']}"
            print(f"{manifest['client']['denumire']:<34} {len(manifest['documente'])} documents{note}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--username", default="officer")
    parser.add_argument("--password", default="12345")
    parser.add_argument("--start", action="store_true", help="start the agents on every case")
    args = parser.parse_args()
    seed(args.url, args.username, args.password, args.start)


if __name__ == "__main__":
    main()
