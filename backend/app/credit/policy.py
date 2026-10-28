"""Credit policy engine. The rules live in versioned JSON standards (fixtures/credit/standards), the reference rate in
market snapshots; this module only evaluates them. Deterministic: the language model never decides an outcome here.

evaluate() turns the analysis inputs into rule results, pricing, a recommended decision with reason codes, conditions
and the authority level that must sign. Humans decide; the recommendation is advice with evidence references."""
from dataclasses import dataclass, field

from app.credit import finance
from app.credit.numbers import fmt_pct, fmt_ron, fmt_x

LEVELS = ("L1", "L2", "L3")
ROLE_LEVEL = {"credit_analyst": "L1", "risk_officer": "L2", "credit_committee": "L3"}


@dataclass
class Inputs:
    amount: float
    term_months: int
    product: str
    purpose: str
    secured: bool
    cfads: float | None                 # EBITDA − profit tax, latest year
    ebitda: float | None
    net_debt: float | None              # financial debt − cash, before the new loan
    revenue: float | None
    revenue_previous: float | None
    years_in_business: float | None
    existing_service: float | None      # annual instalments from the credit bureau
    bureau_max_dpd: int | None
    collateral_value: float | None
    group_exposure: float               # existing approved exposure of connected clients at this bank
    kyc_failed: list[str] = field(default_factory=list)
    sanctions_hits: int = 0
    turnover_gap_pct: float | None = None
    concentration_pct: float | None = None
    top_client: str | None = None
    missing: list[str] = field(default_factory=list)
    open_requests: int = 0


def margin_class(standards: dict, nd_ebitda: float | None, dpd: int | None) -> str:
    for rc in standards["risk_classes"]:
        if nd_ebitda is not None and nd_ebitda <= rc["net_debt_ebitda_max"] and (rc["class"] != "A" or not dpd):
            return rc["class"]
    return standards["risk_classes"][-1]["class"]


def terms_for(standards: dict, market: dict, x: Inputs, amount: float, months: int) -> dict:
    """Price and test a given amount/term: rate, instalment, DSCR (base and stressed), LTV, pro-forma leverage."""
    t, pricing = standards["thresholds"], standards["pricing"]
    nd = (x.net_debt or 0) + amount
    nd_ebitda = nd / x.ebitda if x.ebitda else None
    risk = margin_class(standards, nd_ebitda, x.bureau_max_dpd)
    margin = pricing["margins_pct"][risk]
    rate = round(market["value_pct"] + margin, 2)
    service = x.existing_service or 0
    base = finance.dscr(x.cfads, service, amount, rate, months) if x.cfads is not None else None
    stressed = finance.dscr(x.cfads, service, amount, rate + pricing["stress_shock_pp"], months) if x.cfads is not None else None
    ltv = finance.ltv_pct(amount, x.collateral_value) if x.secured else None
    passes = (base is not None and base >= t["dscr_min"] and stressed >= t["dscr_stressed_min"]
              and (nd_ebitda is not None and nd_ebitda <= t["net_debt_ebitda_max"])
              and (ltv is None or ltv <= t["ltv_max_pct"]) and (not x.secured or x.collateral_value))
    return {"amount": round(amount), "term_months": months, "rate_pct": rate, "margin_pct": margin, "index": market["index"],
            "index_value_pct": market["value_pct"], "monthly_payment": round(finance.monthly_payment(amount, rate, months)),
            "dscr": round(base, 4) if base is not None else None, "dscr_stressed": round(stressed, 4) if stressed is not None else None,
            "ltv_pct": round(ltv, 1) if ltv is not None else None,
            "net_debt_ebitda": round(nd_ebitda, 2) if nd_ebitda is not None else None, "risk_class": risk, "passes": bool(passes)}


def max_amount(standards: dict, market: dict, x: Inputs, months: int) -> tuple[int, str]:
    """Largest amount meeting DSCR, stressed DSCR, leverage and LTV, rounded down; returns (amount, binding constraint)."""
    t, pricing = standards["thresholds"], standards["pricing"]
    candidates = []
    for _ in range(3):  # the margin depends on leverage, which depends on the amount: iterate to a fixed point
        probe = min([c for c, _ in candidates] or [x.amount])
        rate = terms_for(standards, market, x, probe, months)["rate_pct"]
        candidates = [(finance.max_amount_for_dscr(x.cfads, x.existing_service or 0, t["dscr_min"], rate, months), "DSCR"),
                      (finance.max_amount_for_dscr(x.cfads, x.existing_service or 0, t["dscr_stressed_min"],
                                                   rate + pricing["stress_shock_pp"], months), "DSCR stresat"),
                      (t["net_debt_ebitda_max"] * x.ebitda - (x.net_debt or 0), "Datorie netă / EBITDA")]
        if x.secured and x.collateral_value:
            candidates.append((t["ltv_max_pct"] / 100 * x.collateral_value, "LTV"))
        candidates.append((x.amount, "suma solicitată"))
    value, binding = min(candidates, key=lambda c: c[0])
    amount = finance.floor_to(value, pricing["rounding_ron"])
    for _ in range(500):  # the margin class can step up as the amount falls; walk down until every rule passes
        if amount <= 0 or terms_for(standards, market, x, amount, months)["passes"]:
            break
        amount -= pricing["rounding_ron"]
    return max(amount, 0), binding


def level_for(standards: dict, exposure: float, exceptions: bool) -> tuple[str, str]:
    if exceptions:
        return "L3", "Excepție de la politică: decide comitetul de credit (2 voturi)."
    for a in standards["authority"]:
        limit = a["max_group_exposure_ron"]
        if limit is None or exposure <= limit:
            return a["level"], f"Expunere de grup {fmt_ron(exposure)} în limita {('nelimitată' if limit is None else fmt_ron(limit))} a nivelului {a['level']}."
    return "L3", "Peste limitele individuale: comitet de credit."


def rule(rule_id, title, outcome, detail, value=None, threshold=None, refs=()):
    return {"rule_id": rule_id, "title": title, "outcome": outcome, "detail": detail, "value": value,
            "threshold": threshold, "metric_refs": list(refs)}


def evaluate(standards: dict, market: dict, x: Inputs) -> dict:
    t = standards["thresholds"]
    rules, reasons, conditions = [], [], []
    req = terms_for(standards, market, x, x.amount, x.term_months) if x.cfads is not None and x.ebitda else None

    def reason(code, text, refs=()):
        reasons.append({"code": code, "text": text, "refs": list(refs)})

    # Data completeness first: no recommendation on missing evidence.
    rules.append(rule("CR-11", "Documente obligatorii complete", "FAIL" if x.missing else "PASS",
                      "Lipsesc: " + "; ".join(x.missing) if x.missing else "Toate documentele cerute de politică sunt în dosar.", refs=["missing"]))
    if req:
        rules.append(rule("CR-01", "DSCR la suma solicitată", "PASS" if req["dscr"] >= t["dscr_min"] else "FAIL",
                          f"Capacitatea de rambursare la {fmt_ron(x.amount)}, {x.term_months} luni, dobândă {fmt_pct(req['rate_pct'], 2)}.",
                          fmt_x(req["dscr"]), f"≥ {fmt_x(t['dscr_min'])}", ["dscr_requested", "cfads", "existing_service"]))
        rules.append(rule("CR-02", "DSCR în scenariu de stres (+" + str(standards["pricing"]["stress_shock_pp"]).replace(".", ",") + " pp)",
                          "PASS" if req["dscr_stressed"] >= t["dscr_stressed_min"] else "FAIL",
                          "Dobânda crește cu șocul de stres din politică.", fmt_x(req["dscr_stressed"]), f"≥ {fmt_x(t['dscr_stressed_min'])}",
                          ["dscr_stressed_requested"]))
        rules.append(rule("CR-03", "Datorie netă / EBITDA pro-formă", "PASS" if req["net_debt_ebitda"] <= t["net_debt_ebitda_max"] else "FAIL",
                          "Include creditul solicitat.", fmt_x(req["net_debt_ebitda"]), f"≤ {fmt_x(t['net_debt_ebitda_max'])}", ["net_debt_ebitda"]))
    if x.years_in_business is not None:
        rules.append(rule("CR-04", "Vechime în activitate", "PASS" if x.years_in_business >= t["years_in_business_min"] else "FAIL",
                          "Calculată din data înființării din registru.", f"{x.years_in_business:.1f} ani".replace(".", ","),
                          f"≥ {t['years_in_business_min']} ani", ["years_in_business"]))
    if x.bureau_max_dpd is not None:
        outcome = "FAIL" if x.bureau_max_dpd >= t["bureau_dpd_max"] else "PASS"
        rules.append(rule("CR-05", "Istoric Biroul de Credit (12 luni)", outcome,
                          "Restanța maximă raportată în ultimele 12 luni.", f"{x.bureau_max_dpd} zile",
                          f"< {t['bureau_dpd_max']} zile (eliminatoriu ≥ {t['bureau_dpd_knockout']})", ["bureau_max_dpd"]))
    if x.secured:
        if x.collateral_value:
            rules.append(rule("CR-06", "Grad de acoperire cu garanții (LTV)", "PASS" if req and req["ltv_pct"] <= t["ltv_max_pct"] else "FAIL",
                              "Suma solicitată raportată la valoarea de piață din raportul de evaluare.",
                              fmt_pct(req["ltv_pct"]) if req and req["ltv_pct"] is not None else None, f"≤ {fmt_pct(t['ltv_max_pct'], 0)}",
                              ["ltv_requested", "collateral_value"]))
        else:
            rules.append(rule("CR-06", "Grad de acoperire cu garanții (LTV)", "UNKNOWN", "Lipsește raportul de evaluare a garanției."))
    if x.turnover_gap_pct is not None:
        within = abs(x.turnover_gap_pct) <= t["turnover_gap_tolerance_pct"]
        rules.append(rule("CR-07", "Încasări operaționale vs. cifra de afaceri", "PASS" if within else "FAIL",
                          "Extrasele de cont, fără fluxuri intragrup, de la asociați și de finanțare.", fmt_pct(x.turnover_gap_pct),
                          f"± {fmt_pct(t['turnover_gap_tolerance_pct'], 0)}", ["turnover_gap_pct"]))
    if x.concentration_pct is not None:
        high = x.concentration_pct > t["client_concentration_max_pct"] * 0.85
        rules.append(rule("CR-08", "Concentrarea pe clientul principal", "WARN" if high else "PASS",
                          f"Clientul principal: {x.top_client or '—'}.", fmt_pct(x.concentration_pct),
                          f"≤ {fmt_pct(t['client_concentration_max_pct'], 0)}", ["client_concentration_pct"]))
    if x.revenue and x.revenue_previous:
        change = (x.revenue / x.revenue_previous - 1) * 100
        rules.append(rule("CR-09", "Evoluția cifrei de afaceri", "PASS" if change >= -t["revenue_drop_max_pct"] else "FAIL",
                          "Ultimul exercițiu față de cel anterior.", fmt_pct(change), f"scădere ≤ {fmt_pct(t['revenue_drop_max_pct'], 0)}",
                          ["revenue_growth_pct"]))
    rules.append(rule("CR-10", "KYC/KYB fără neconformități", "FAIL" if (x.kyc_failed or x.sanctions_hits) else "PASS",
                      "; ".join(x.kyc_failed + ([f"{x.sanctions_hits} potriviri în listele de sancțiuni"] if x.sanctions_hits else []))
                      or "Verificările de identitate, registru și sancțiuni nu au găsit neconformități.", refs=["kyc"]))

    def result(decision, proposed, level, level_reason):
        return {"decision": decision, "requested": {"amount": round(x.amount), "term_months": x.term_months, "product": x.product, "purpose": x.purpose},
                "proposed": proposed, "reasons": reasons, "conditions": conditions, "level": level, "level_reason": level_reason,
                "policy_version": standards["version"], "rules": rules,
                "market": {"index": market["index"], "value_pct": market["value_pct"], "as_of": market["as_of"], "source": market["source"]}}

    if x.product != standards['product']['label']:
        reason("R-PRODUCT", "Produsul nu are o politică implementată în acest MVP.")
        return result("NEEDS_INFORMATION", None, "L1", "Este necesară politica produsului solicitat.")

    # Knock-outs: no amount makes these acceptable.
    knockouts = []
    if x.bureau_max_dpd is not None and x.bureau_max_dpd >= t["bureau_dpd_knockout"]:
        knockouts.append(("R-BUREAU-90D", f"Restanță de {x.bureau_max_dpd} de zile la Biroul de Credit în ultimele 12 luni.", ["bureau_max_dpd"]))
    if x.sanctions_hits:
        knockouts.append(("R-SANCTIONS", "Potrivire în listele de sancțiuni: necesită clarificare de conformitate.", ["kyc"]))
    if x.years_in_business is not None and x.years_in_business < t["years_in_business_min"]:
        knockouts.append(("R-SENIORITY", "Vechime sub minimul din politică.", ["years_in_business"]))
    if knockouts:  # decided before completeness: the client is not asked for documents on a case that cannot pass
        for code, text, refs in knockouts:
            reason(code, text, refs)
        return result("DECLINE", None, "L1", "Respingerea nu creează expunere: competență L1. Aprobarea ar fi o excepție (L3).")
    essential = (x.cfads, x.ebitda, x.net_debt, x.existing_service, x.revenue, x.revenue_previous, x.years_in_business, x.bureau_max_dpd)
    if any(v is None for v in essential) or (x.secured and x.collateral_value is None) or (x.ebitda is not None and x.ebitda <= 0):
        reason("R-DATA", "Date esențiale insuficiente sau EBITDA nepozitivă; necesită verificare umană.")
        return result("NEEDS_INFORMATION", None, "L1", "Datele necesare capacității de rambursare nu sunt complete.")
    if x.missing or x.open_requests:
        reason("R-MISSING", "Dosar incomplet: " + "; ".join(x.missing or ["răspunsul clientului este în așteptare"]), ["missing"])
        return result("NEEDS_INFORMATION", None, "L1", "Dosar incomplet: nu se poate decide încă.")
    if x.kyc_failed:
        knockouts.append(("R-KYC", "Neconformitate KYC nerezolvată: " + "; ".join(x.kyc_failed), ["kyc"]))
    if knockouts or not req:
        for code, text, refs in knockouts or [("R-DATA", "Date financiare insuficiente pentru evaluarea capacității de rambursare.", [])]:
            reason(code, text, refs)
        return result("DECLINE", None, "L1", "Respingerea nu creează expunere: competență L1. Aprobarea ar fi o excepție (L3).")

    failing = [r for r in rules if r["outcome"] == "FAIL"]
    if x.secured:
        conditions.append("Ipotecă de rang I asupra imobilului finanțat, asigurată și cesionată în favoarea băncii.")
    if x.concentration_pct is not None and x.concentration_pct > t["client_concentration_max_pct"] * 0.85:
        conditions.append(f"Covenant: raportare semestrială a concentrării clienților ({x.top_client} {fmt_pct(x.concentration_pct)}; prag {fmt_pct(t['client_concentration_max_pct'], 0)}).")
    conditions.append(f"Covenant: DSCR anual ≥ {fmt_x(t['dscr_min'])}, testat pe situațiile financiare anuale.")
    conditions.append("Rulaj prin conturile Banca Demo proporțional cu expunerea (min. 60% din încasările operaționale).")

    if req["passes"] and not failing:
        reason("R-OK", f"Toate regulile trec la suma solicitată (DSCR {fmt_x(req['dscr'])}).", ["dscr_requested"])
        level, why = level_for(standards, req["amount"] + x.group_exposure, False)
        return result("APPROVE_WITH_CONDITIONS" if len(conditions) > 2 else "APPROVE", req, level, why)

    for r in failing:
        reason("R-" + r["rule_id"], f"{r['title']}: {r['value']} (prag {r['threshold']}).", r["metric_refs"])
    if any(r["rule_id"] in {"CR-07", "CR-09", "CR-10"} for r in failing):
        # Not a sizing problem: a smaller amount would not fix it.
        return result("DECLINE", None, "L1", "Respingerea nu creează expunere: competență L1. Aprobarea ar fi o excepție (L3).")
    amount, binding = max_amount(standards, market, x, x.term_months)
    if amount >= x.amount * 0.5:
        offer = terms_for(standards, market, x, amount, x.term_months)
        reason("R-COUNTER", f"Suma maximă care respectă politica: {fmt_ron(amount)} (limitată de {binding}).", ["dscr_offer"])
        level, why = level_for(standards, amount + x.group_exposure, False)
        return result("COUNTER_OFFER", offer, level, why)
    reason("R-CAPACITY", f"Capacitatea de rambursare permite cel mult {fmt_ron(amount)}, sub jumătate din suma solicitată.", ["dscr_requested"])
    return result("DECLINE", None, "L1", "Respingerea nu creează expunere: competență L1. Aprobarea ar fi o excepție (L3).")


def required_level(standards: dict, recommendation: dict, action: str, terms: dict | None, group_exposure: float) -> tuple[str, bool, str]:
    """Authority needed for a human decision, and whether it overrides the recommendation."""
    kind = recommendation["decision"]
    if action == "REJECT":
        override = kind != "DECLINE"
        return ("L1", override, "Respingerea nu creează expunere.")
    if kind == "DECLINE":
        return ("L3", True, "Aprobarea unui dosar recomandat spre respingere este o excepție de politică.")
    if terms is None or not terms.get("passes", False):
        return ("L3", True, "Termenii aleși nu respectă politica: excepție, decide comitetul.")
    level, why = level_for(standards, terms["amount"] + group_exposure, False)
    proposed = recommendation.get("proposed") or {}
    override = action == "MODIFY" or terms["amount"] != proposed.get("amount") or terms["term_months"] != proposed.get("term_months")
    return level, override, why
