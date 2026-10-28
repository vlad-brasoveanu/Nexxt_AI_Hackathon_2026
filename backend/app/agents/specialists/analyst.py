"""Descriptive history context, independent of the policy decision."""
import sqlite3
from app.agents import board as B
from app.risk.history import load, compare, applicant_from_board, NOTE


def synthesize(board, env):
    try:
        result = compare(load(getattr(env.sources, "history_path", None)), env.case["meta"].get("caen"),
                         env.case["meta"].get("product"), applicant_from_board(board))
        summary = f"{result['n']} cazuri comparabile RO, sector {result['sector'] or 'nemapat'}. {result['limitation']}"
    except (OSError, ValueError, sqlite3.Error) as exc:
        result = {"n": 0, "comparables": [], "outcomes": [], "limited": True, "note": NOTE, "error": type(exc).__name__}
        summary = "Istoricul nu este disponibil; nu generăm statistici de substituție."
    board["historical_context"] = result
    board["analyst"] = {"risk_class": None, "summary": summary, "benchmarks": [], "precedents": [],
                        "neighbors": None, "sector": result.get("sector"), "note": NOTE}
    B.mark_ran(board, "analyst", summary)
    return B.Report(title=summary, status="warning" if result["limited"] else "ok", detail=result)
