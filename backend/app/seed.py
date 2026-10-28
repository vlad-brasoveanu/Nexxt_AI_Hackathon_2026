"""Create the fixed local-demo accounts. Demo only: every account uses the same public password."""
from sqlalchemy import select
from app.config import Settings
from app.core.security import passwords
from app.db import User, connect

DEMO_PASSWORD = "12345"
# username → role. The credit roles sign decisions on authority levels L1, L2 and L3 (committee: two members).
DEMO_USERS = {"manager": "manager", "analyst": "analyst", "supervisor": "supervisor", "credit_analyst": "credit_analyst",
              "risk_officer": "risk_officer", "committee_a": "credit_committee", "committee_b": "credit_committee"}


def main():
    engine, factory = connect(Settings().database_url)
    hashed = passwords.hash(DEMO_PASSWORD)
    with factory.begin() as session:
        for username, role in DEMO_USERS.items():
            user = session.scalar(select(User).where(User.username == username))
            if user:
                user.password_hash, user.role = hashed, role
            else:
                session.add(User(username=username, password_hash=hashed, role=role, team="demo"))
    engine.dispose()
    print(f"Demo accounts ready: {', '.join(DEMO_USERS)} · password {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
