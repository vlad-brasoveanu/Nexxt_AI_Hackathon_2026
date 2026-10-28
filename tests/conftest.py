from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from app.ai import ModelRouter
from app.api import create_app
from app.core.security import passwords
from app.config import Settings
from app.db import Base, User
from helpers import login


@pytest.fixture
def app(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}", storage_dir=str(tmp_path / "documents"), secure_cookies=False,
                        fixtures_dir=str(Path(__file__).resolve().parents[1] / "fixtures"), agent_sync=True, evaluation_date="2026-10-28")
    app = create_app(settings, models=ModelRouter())  # deterministic unless a test injects scripted models
    Base.metadata.create_all(app.state.engine)
    hashed = passwords.hash("test-password-only-123")
    with app.state.session_factory.begin() as db:
        for name, role, team in [("admin", "admin", "demo"), ("manager", "manager", "demo"), ("other", "manager", "demo"), ("analyst", "analyst", "demo"), ("supervisor", "supervisor", "demo"),
                                 ("outsider", "analyst", "other"), ("credit_analyst", "credit_analyst", "demo"), ("risk_officer", "risk_officer", "demo"),
                                 ("committee_a", "credit_committee", "demo"), ("committee_b", "credit_committee", "demo")]:
            db.add(User(username=name, password_hash=hashed, role=role, team=team, authority_level="L3" if role=="admin" else None))
    yield app
    app.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        login(client)
        yield client
