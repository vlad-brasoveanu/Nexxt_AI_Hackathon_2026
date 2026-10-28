import pytest
from fastapi.testclient import TestClient
from app.api import create_app
from app.core.security import passwords
from app.config import Settings
from app.db import Base, User
from helpers import login


@pytest.fixture
def app(tmp_path):
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}", storage_dir=str(tmp_path / "documents"), secure_cookies=False))
    Base.metadata.create_all(app.state.engine)
    hashed = passwords.hash("test-password-only-123")
    with app.state.session_factory.begin() as db:
        for name, role, team in [("manager", "manager", "demo"), ("other", "manager", "demo"), ("analyst", "analyst", "demo"), ("supervisor", "supervisor", "demo"), ("outsider", "analyst", "other")]:
            db.add(User(username=name, password_hash=hashed, role=role, team=team))
    yield app
    app.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        login(client)
        yield client
