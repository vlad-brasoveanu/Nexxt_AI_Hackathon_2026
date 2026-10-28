"""Analist financiar complex: puts the specialists' results in context with the synthetic history of past cases —
sector benchmarks, similar precedents and how they performed. Descriptive statistics for the human reader; it never
feeds the deterministic recommendation."""
from app.agents import board as B
from app.agents.specialists.policy import inputs_from_board
from app.credit import history
from app.credit import policy as engine
from app.credit.numbers import fmt_pct, fmt_ron

METRIC_FOR = {"ebitda_margin_pct": "ebitda_margin_pct", "current_ratio": "current_ratio", "client_concentration_pct": "client_concentration_pct"}


def synthesize(board: dict, env: B.Env) -> B.Report:
    x = inputs_from_board(board, env)
    sector = history.sector_for_caen(str(env.case["meta"].get("caen", "")))
    applicant = {}
    terms = None
    if x.cfads is not None and x.ebitda:
        terms = engine.terms_for(env.standards, env.market, x, x.amount, x.term_months)
        applicant.update(dscr=terms["dscr"], net_debt_ebitda=terms["net_debt_ebitda"])
    for key in ("ebitda_margin_pct", "current_ratio", "client_concentration_pct", "years_in_business"):
        m = board["metrics"].get(key)
        if m:
            applicant[key] = m["value"]
    if x.revenue:
        applicant["revenue_ron"] = x.revenue
    if not applicant:
        B.mark_ran(board, "analyst", "Date insuficiente pentru comparații statistice")
        return B.Report(title="Date insuficiente pentru comparații statistice", status="warning")
    benchmarks = history.benchmarks(sector, applicant)
    precedents = history.precedents(sector, applicant, k=5)
    hood = history.neighborhood(sector, applicant, k=25)
    for b in benchmarks:
        if b["metric"] in METRIC_FOR and METRIC_FOR[b["metric"]] in board["metrics"]:
            board["metrics"][METRIC_FOR[b["metric"]]]["benchmark"] = {k: b[k] for k in ("sector", "p25", "median", "p75", "percentile")}
    label = history.SECTOR_LABELS.get(sector, sector)
    risk = terms["risk_class"] if terms else None
    parts = [f"Sector {label} ({sector})"]
    if x.revenue:
        parts.append(f"cifră de afaceri {fmt_ron(x.revenue)}")
    margin = next((b for b in benchmarks if b["metric"] == "ebitda_margin_pct"), None)
    if margin:
        parts.append(f"marjă EBITDA {fmt_pct(margin['value'])}, percentila {margin['percentile']} în sector")
    summary = "; ".join(parts) + (f". Din {hood['n']} cazuri istorice similare, {fmt_pct(hood['approved_pct'])} au fost finanțate, "
                                  f"cu rată de nerambursare {fmt_pct(hood['default_rate_pct'])} (IC 95%: {fmt_pct(hood['ci_low_pct'])}–{fmt_pct(hood['ci_high_pct'])})."
                                  if hood["n"] else ".")
    board["analyst"] = {"risk_class": risk, "summary": summary, "benchmarks": benchmarks, "precedents": precedents,
                        "neighbors": hood, "sector": sector, "note": history.SYNTHETIC_NOTE}
    B.mark_ran(board, "analyst", summary)
    return B.Report(title=f"Context statistic: {len(precedents)} precedente, {hood['n']} cazuri similare; clasa de risc {risk or '—'}",
                    thought=summary, detail={"sector": sector, "risk_class": risk, "neighbors": hood})
