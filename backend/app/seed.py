"""Create the fixed local-demo accounts. Demo only: every account uses the same public password."""
from sqlalchemy import select
from app.config import Settings
from app.core.security import passwords
from app.db import User, connect

DEMO_PASSWORD = "12345"
DEMO_USERS = ("manager", "analyst", "supervisor")


def main():
    engine, factory = connect(Settings().database_url)
    hashed = passwords.hash(DEMO_PASSWORD)
    with factory.begin() as session:
        for role in DEMO_USERS:
            user = session.scalar(select(User).where(User.username == role))
            if user:
                user.password_hash = hashed
            else:
                session.add(User(username=role, password_hash=hashed, role=role, team="demo"))
    engine.dispose()
    print(f"Demo accounts ready: {', '.join(DEMO_USERS)} · password {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
