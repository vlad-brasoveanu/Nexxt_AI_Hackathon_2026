"""Explicit local-demo account creation; never invoked automatically by API startup."""
import os
from sqlalchemy import select
from app.api import passwords
from app.config import Settings
from app.db import User, connect


def main():
    password = os.environ.get("CASECHECK_DEMO_PASSWORD", "")
    if len(password) < 5:
        raise SystemExit("Set CASECHECK_DEMO_PASSWORD to a value of at least 5 characters.")
    engine, factory = connect(Settings().database_url)
    with factory.begin() as session:
        for role in ("manager", "analyst", "supervisor"):
            if not session.scalar(select(User).where(User.username == role)):
                session.add(User(username=role, password_hash=passwords.hash(password), role=role, team="demo"))
    engine.dispose()
    print("Demo accounts ready: manager, analyst, supervisor. Existing credentials unchanged.")


if __name__ == "__main__":
    main()
