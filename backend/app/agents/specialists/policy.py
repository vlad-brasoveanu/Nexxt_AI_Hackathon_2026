"""Agent Politică: assembles the policy inputs from the board and runs the deterministic engine (app.credit.policy)
on the standards version and reference rate in force. The model never sees or changes the thresholds."""
from app.agents import board as B
from app.credit import policy as engine
from app.credit.numbers import fmt_pct, fmt_ron, fmt_x

LABEL = {"APPROVE": "Aprobare", "APPROVE_WITH_CONDITIONS": "Aprobare cu condiții", "COUNTER_OFFER": "Contraofertă",
         "DECLINE": "Respingere", "NEEDS_INFORMATION": "Necesită informații"}


def metric_value(board, id):
    m = board["metrics"].get(id)
    return m["value"] if m else None


def inputs_from_board(board: dict, env: B.Env) -> engine.Inputs:
    meta = env.case["meta"]
    latest = (board.get("financials") or {}).get("latest")
    kyb = board.get("kyb") or {}
    missing = [i.get("client_action") or i["title"] for i in B.open_issues(board) if i.get("client_action") or i["severity"] == "blocking"]
    return engine.Inputs(
        amount=float(meta.get("amount", 0)), term_months=int(meta.get("term_months", 60)), product=meta.get("product", ""),
        purpose=meta.get("purpose", ""), secured=bool(meta.get("secured")),
        cfads=metric_value(board, "cfads"), ebitda=metric_value(board, "ebitda"), net_debt=metric_value(board, "net_debt"),
        revenue=B.value_of(board, f"fs{latest}-revenue") if latest else None,
        revenue_previous=B.value_of(board, f"fs{latest - 1}-revenue") if latest else None,
        years_in_business=metric_value(board, "years_in_business"), existing_service=metric_value(board, "existing_service"),
        bureau_max_dpd=kyb.get("bureau_max_dpd"), collateral_value=metric_value(board, "collateral_value"),
        group_exposure=metric_value(board, "group_exposure") or 0.0, kyc_failed=list(kyb.get("kyc_failed", [])),
        sanctions_hits=kyb.get("sanctions_hits", 0), turnover_gap_pct=metric_value(board, "turnover_gap_pct"),
        concentration_pct=metric_value(board, "client_concentration_pct"), top_client=(board.get("cashflow") or {}).get("top_client"),
        missing=missing, open_requests=board.get("requests_open", 0))


def sources_of(board, *ids):
    out = []
    for id in ids:
        out.extend((board["metrics"].get(id) or {}).get("sources", [])[:3])
    return out


def evaluate(board: dict, env: B.Env) -> B.Report:
    x = inputs_from_board(board, env)
    result = engine.evaluate(env.standards, env.market, x)
    board["rules"] = result.pop("rules")
    if x.cfads is not None and x.ebitda:
        req = engine.terms_for(env.standards, env.market, x, x.amount, x.term_months)
        base = sources_of(board, "cfads", "existing_service")
        B.metric(board, "rate_pct", "Dobânda anuală (indice + marjă)", req["rate_pct"], "%", fmt_pct(req["rate_pct"], 2), "policy",
                 f"{req['index']} {fmt_pct(req['index_value_pct'], 2)} + marjă {fmt_pct(req['margin_pct'], 2)} (clasa {req['risk_class']})", [])
        B.metric(board, "dscr_requested", "DSCR la suma solicitată", req["dscr"], "x", fmt_x(req["dscr"]), "policy",
                 "CFADS / (serviciul datoriilor existente + anuitatea creditului solicitat)", base)
        B.metric(board, "dscr_stressed_requested", "DSCR în scenariu de stres", req["dscr_stressed"], "x", fmt_x(req["dscr_stressed"]), "policy",
                 f"Dobândă + {env.standards['pricing']['stress_shock_pp']} pp", base)
        B.metric(board, "net_debt_ebitda", "Datorie netă / EBITDA pro-formă", req["net_debt_ebitda"], "x", fmt_x(req["net_debt_ebitda"]), "policy",
                 "(Datorie netă + credit solicitat) / EBITDA", sources_of(board, "net_debt", "ebitda"))
        if req["ltv_pct"] is not None:
            B.metric(board, "ltv_requested", "LTV la suma solicitată", req["ltv_pct"], "%", fmt_pct(req["ltv_pct"]), "policy",
                     "Suma solicitată / valoarea de piață a garanției", sources_of(board, "collateral_value"))
    proposed = result["proposed"]
    if proposed and result["decision"] == "COUNTER_OFFER":
        B.metric(board, "dscr_offer", "DSCR la suma propusă", proposed["dscr"], "x", fmt_x(proposed["dscr"]), "policy",
                 f"La {fmt_ron(proposed['amount'])}, {proposed['term_months']} luni", sources_of(board, "cfads", "existing_service"))
    previous = board.get("recommendation")
    if previous and (previous["decision"], (previous.get("proposed") or {}).get("amount"), previous["market"]["value_pct"]) != \
            (result["decision"], (proposed or {}).get("amount"), result["market"]["value_pct"]):
        board["recommendation_history"].append({**previous, "superseded": True})
    board["recommendation"] = {**result, "superseded": False}
    failed = [r["rule_id"] for r in board["rules"] if r["outcome"] == "FAIL"]
    summary = f"{LABEL[result['decision']]}" + (f" {fmt_ron(proposed['amount'])} la {fmt_pct(proposed['rate_pct'], 2)}, DSCR {fmt_x(proposed['dscr'])}" if proposed else "") \
        + f"; nivel {result['level']}" + (f"; reguli eșuate: {', '.join(failed)}" if failed else "")
    B.mark_ran(board, "policy", summary)
    return B.Report(title=summary, status="ok" if result["decision"] in {"APPROVE", "APPROVE_WITH_CONDITIONS"} else "warning",
                    thought=f"Standard {result['policy_version']}; {result['market']['index']} {fmt_pct(result['market']['value_pct'], 2)} "
                            f"la {result['market']['as_of']}. " + " ".join(r["text"] for r in result["reasons"][:3]),
                    detail={"decision": result["decision"], "level": result["level"], "proposed": proposed, "failed_rules": failed})
