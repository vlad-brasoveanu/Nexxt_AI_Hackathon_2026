from app.db import AuditEvent


def audit(session, user, action, case_id=None, **details):
    session.add(AuditEvent(actor_id=user.id, case_id=case_id, action=action, details=details))
