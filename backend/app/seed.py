"""Create the fixed local-demo accounts. Demo only: every account uses the same public password."""
from sqlalchemy import select
from app.config import Settings
from app.core.security import passwords
from app.db import User, connect

DEMO_PASSWORD = "12345"
# username → role. The credit roles sign decisions on authority levels L1, L2 and L3 (committee: two members).
DEMO_USERS = {"officer": "case_officer", "risk": "risk_reviewer", "admin": "admin"}


def main():
    engine, factory = connect(Settings().database_url)
    hashed = passwords.hash(DEMO_PASSWORD)
    with factory.begin() as session:
        for username, role in DEMO_USERS.items():
            user = session.scalar(select(User).where(User.username == username))
            if user:
                continue
            else:
                session.add(User(username=username, password_hash=hashed, role=role, team="demo", authority_level="L3" if role != "case_officer" else None))
    engine.dispose()
    print(f"Demo accounts ready: {', '.join(DEMO_USERS)} · password {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
