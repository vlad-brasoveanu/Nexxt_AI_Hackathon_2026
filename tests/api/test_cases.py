import json
import pytest
from fastapi.testclient import TestClient
from helpers import login
from helpers import packet, run


@pytest.mark.parametrize("variant,disposition", [("clean", "READY_FOR_REVIEW"), ("mismatch", "ESCALATED"), ("expired", "ESCALATED"), ("missing_identity", "NEEDS_INFORMATION")])
def test_end_to_end(client, variant, disposition):
    cid, revision, _ = packet(client, variant)
    response = run(client, cid, revision)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["result"]["disposition"] == disposition
    assert body["result"]["processing_mode"] == "manual_structured"
    assert len(body["result"]["trace"]) == 3
    assert body["snapshot"]["workflow"]["version"] == "0.1.0"
    assert client.get(f"/api/v1/runs/{body['id']}").json()["is_current"]


@pytest.mark.parametrize("username", ["other", "outsider"])
def test_case_document_run_scope(client, app, username):
    cid, revision, facts = packet(client)
    run_id = run(client, cid, revision).json()["id"]
    with TestClient(app) as stranger:
        login(stranger, username)
        for path in [f"cases/{cid}", f"documents/{facts[0]['evidence']['document_id']}/download", f"runs/{run_id}", f"runs/{run_id}/trace", f"runs/{run_id}/findings"]:
            assert stranger.get(f"/api/v1/{path}").status_code == 404
        assert stranger.get("/api/v1/cases").json() == []


def test_csrf_origin_and_logout(client):
    assert client.post("/api/v1/cases", json={"title": "x"}, headers={"x-csrf-token": "wrong"}).status_code == 403
    assert client.post("/api/v1/cases", json={"title": "x"}, headers={"origin": "https://attacker.invalid"}).status_code == 403
    assert client.delete("/api/v1/session").status_code == 204
    assert client.get("/api/v1/cases").status_code == 401


def test_stale_revision_and_replay(client):
    cid, revision, facts = packet(client)
    first = run(client, cid, revision).json()
    assert run(client, cid, revision).json()["id"] == first["id"]
    assert run(client, cid, revision - 1).status_code == 409
    changed = client.post(f"/api/v1/cases/{cid}/facts", json={"expected_revision": revision, "facts": {"facts": facts}})
    assert changed.status_code == 201
    assert not client.get(f"/api/v1/runs/{first['id']}").json()["is_current"]
    assert run(client, cid, revision, "new-key").status_code == 409


def test_document_change_requires_new_observations(client):
    cid, revision, _ = packet(client)
    response = client.post(f"/api/v1/cases/{cid}/documents", data={"expected_revision": revision, "kind": "application"}, files={"file": ("new.json", json.dumps({"pages": ["New version"]}), "application/json")})
    assert response.status_code == 201
    assert run(client, cid, response.json()["revision"]).status_code == 409


@pytest.mark.parametrize("tamper", ["quote", "sha256", "document_id", "value"])
def test_forged_evidence_rejected(client, tamper):
    cid, revision, facts = packet(client)
    if tamper == "value":
        facts[0]["value"] = "invented"
    else:
        facts[0]["evidence"][tamper] = "0" * 64 if tamper == "sha256" else "invented"
    response = client.post(f"/api/v1/cases/{cid}/facts", json={"expected_revision": revision, "facts": {"facts": facts}})
    assert response.status_code == 422
    assert client.get(f"/api/v1/cases/{cid}").json()["revision"] == revision


def test_supervisor_cannot_edit_evidence(client):
    cid, _, _ = packet(client)
    login(client, "supervisor")
    assert client.get(f"/api/v1/cases/{cid}").status_code == 200
    assert client.post("/api/v1/cases", json={"title": "forbidden"}).status_code == 403


def test_invalid_upload_does_not_mutate(client):
    cid = client.post("/api/v1/cases", json={"title": "upload"}).json()["id"]
    response = client.post(f"/api/v1/cases/{cid}/documents", data={"expected_revision": 0, "kind": "identity"}, files={"file": ("scan.pdf", b"not a PDF", "application/pdf")})
    assert response.status_code == 422
    assert client.get(f"/api/v1/cases/{cid}").json()["revision"] == 0


def test_explicit_preview_origin_still_requires_csrf(tmp_path):
    from app.api import create_app
    from app.core.security import passwords
    from app.config import Settings
    from app.db import Base, User
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'origin.db'}", storage_dir=str(tmp_path / 'docs'), secure_cookies=False, allowed_origins=frozenset({'http://127.0.0.1:5173'})))
    Base.metadata.create_all(app.state.engine)
    with app.state.session_factory.begin() as db:
        db.add(User(username='manager', password_hash=passwords.hash('test-password-only-123'), role='manager', team='demo'))
    with TestClient(app) as browser:
        browser.headers['origin'] = 'http://127.0.0.1:5173'
        session = browser.post('/api/v1/session', json={'username': 'manager', 'password': 'test-password-only-123'})
        assert session.status_code == 200
        assert browser.post('/api/v1/cases', json={'title': 'No CSRF'}).status_code == 403
        browser.headers['x-csrf-token'] = session.json()['csrf_token']
        assert browser.post('/api/v1/cases', json={'title': 'Valid preview request'}).status_code == 201
        browser.headers['origin'] = 'https://untrusted.invalid'
        assert browser.post('/api/v1/cases', json={'title': 'Bad origin'}).status_code == 403
    app.state.engine.dispose()
