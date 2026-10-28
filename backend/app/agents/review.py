"""Decision readiness is enforced server-side, not inferred from one reviewer name."""
from app.agents import board as B


def complete(board):
    facts = board.get("facts", {})
    return bool(facts) and bool(board.get("reviewed_by")) and all(
        f.get("verified") and f.get("review") in {"accepted", "corrected"} for f in facts.values())


def blockers(board):
    result = [i["title"] for i in B.open_issues(board) if i["severity"] == "blocking"]
    if not complete(board):
        result.append("Toate faptele necesare trebuie verificate; valorile respinse cer înlocuire.")
    if any(s.get("status") == "failed" for s in board.get("agents", {}).values()):
        result.append("Un agent a eșuat.")
    if any(i["key"] == "orchestrator:budget" for i in B.open_issues(board)):
        result.append("Analiza este incompletă.")
    return result
