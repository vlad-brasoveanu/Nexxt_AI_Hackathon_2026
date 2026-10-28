"""Agent Memo: drafts the credit note from a data sheet built only from the board. The large model may write the
prose, but every number in its text must appear verbatim in the data sheet; otherwise it gets one correction round,
then the deterministic template is used and the rejection is recorded."""
import re

from app.agents import board as B
from app.agents.llm import ask_text
from app.agents.specialists.policy import LABEL
from app.credit.numbers import fmt_pct, fmt_ron, fmt_x

NUMBER = re.compile(r"\d(?:[\d.,]*\d)?")


def sheet(board: dict, env: B.Env) -> list[tuple[str, str, str]]:
    """(reference, label, value) rows: the only facts the memo may state."""
    meta, rec = env.case["meta"], board.get("recommendation") or {}
    rows = [("client", "Client", f"{meta.get('company', '')}, CUI {meta.get('cui', '')}, CAEN {meta.get('caen', '')}"),
            ("cerere", "Solicitare", f"{meta.get('product', '')}: {fmt_ron(meta.get('amount', 0))}, {meta.get('term_months')} luni; scop: {meta.get('purpose', '')}")]
    for m in board["metrics"].values():
        rows.append((m["id"], m["label"], m["display"]))
    if rec:
        rows.append(("recomandare", "Recomandare Agent Politică", LABEL[rec["decision"]] + f" (nivel {rec['level']}, standard {rec['policy_version']})"))
        p = rec.get("proposed")
        if p:
            rows.append(("termeni", "Termeni propuși", f"{fmt_ron(p['amount'])}, {p['term_months']} luni, dobândă {fmt_pct(p['rate_pct'], 2)} "
                                                       f"({p['index']} {fmt_pct(p['index_value_pct'], 2)} + {fmt_pct(p['margin_pct'], 2)}), "
                                                       f"rată lunară {fmt_ron(p['monthly_payment'])}, DSCR {fmt_x(p['dscr'])}, stres {fmt_x(p['dscr_stressed'])}"
                                                       + (f", LTV {fmt_pct(p['ltv_pct'])}" if p.get("ltv_pct") is not None else "")))
        for r in rec.get("reasons", []):
            rows.append((r["code"], "Motiv", r["text"]))
        for n, c in enumerate(rec.get("conditions", []), 1):
            rows.append((f"conditie-{n}", "Condiție", c))
    kyb = board.get("kyb") or {}
    if kyb:
        rows.append(("grup", "Grup și beneficiari", "; ".join(f"{u['name']} {u['share_pct']}%" for u in kyb.get("ubo", []))
                     + "; afiliați: " + (", ".join(n["label"] for n in kyb.get("nodes", []) if "afiliat" in n.get("flags", [])) or "niciunul")))
    analyst = board.get("analyst") or {}
    if analyst.get("summary"):
        rows.append(("statistica", "Context statistic (date istorice sintetice)", analyst["summary"]))
    for i in board["issues"]:
        if i["status"] == "resolved" and i["agent"] in {"cashflow", "critic", "kyb"}:
            rows.append((i["id"], "Problemă rezolvată de agenți", f"{i['title']} → {i['resolution']}"))
    return rows


def unverified(text: str, allowed: str) -> list[str]:
    known = {t.strip(".,") for t in NUMBER.findall(allowed)}
    return sorted({t.strip(".,") for t in NUMBER.findall(text)} - known - {str(n) for n in range(0, 21)})


def template(board: dict, env: B.Env, rows) -> str:
    meta = env.case["meta"]
    lines = [f"NOTĂ DE CREDIT — {meta.get('company', '')} (CUI {meta.get('cui', '')}) · date sintetice", ""]
    sections = {"Solicitare și recomandare": ("cerere", "recomandare", "termeni"),
                "Analiză financiară": ("revenue_", "ebitda", "ebitda_margin_pct", "cfads", "net_debt", "current_ratio", "revenue_growth_pct", "net_debt_ebitda"),
                "Fluxuri de numerar": ("inflows_total", "operating_inflows", "turnover_gap_pct", "client_concentration_pct"),
                "Grup, KYB și Biroul de Credit": ("grup", "group_exposure", "existing_service", "bureau_max_dpd", "years_in_business"),
                "Capacitate de rambursare": ("rate_pct", "dscr_requested", "dscr_stressed_requested", "ltv_requested", "dscr_offer", "collateral_value"),
                "Motive și condiții": ("R-", "conditie-"),
                "Context statistic și probleme rezolvate": ("statistica", "I-")}
    for title, prefixes in sections.items():
        chosen = [r for r in rows if any(r[0].startswith(p) for p in prefixes)]
        if chosen:
            lines.append(title.upper())
            lines += [f"• {label}: {value} [{ref}]" for ref, label, value in chosen]
            lines.append("")
    rec = board.get("recommendation") or {}
    lines.append(f"Decizia aparține analistului uman cu competența {rec.get('level', '—')}. Agenții nu aprobă și nu resping credite.")
    return "\n".join(lines)


def draft(board: dict, env: B.Env) -> B.Report:
    rows = sheet(board, env)
    data = "\n".join(f"[{ref}] {label}: {value}" for ref, label, value in rows)
    text, model, rejected = None, None, []
    if env.models and env.models.large:
        messages = [
            {"role": "system", "content": "Ești analist de credit într-o bancă din România și redactezi o notă de credit concisă (maximum 350 de cuvinte), "
                                          "în limba română, pentru un decident uman. Folosești DOAR informațiile din fișa de date. Orice cifră o copiezi exact "
                                          "cum apare în fișă și pui referința în paranteze drepte după ea, ex. [ebitda]. Nu recomanzi altceva decât Agentul Politică "
                                          "și nu scrii că un credit este aprobat: decizia este umană. Secțiuni: Sinteză, Analiză financiară, Fluxuri de numerar, "
                                          "Grup și KYB, Riscuri și atenuare, Condiții."},
            {"role": "user", "content": f"Fișa de date:\n{data}"}]
        for _ in range(2):
            candidate, model = ask_text(env, "large", messages)
            if candidate is None:
                break
            bad = unverified(candidate, data)
            if not bad:
                text = candidate.strip()
                break
            rejected.append(bad)
            messages = messages + [{"role": "assistant", "content": candidate},
                                   {"role": "user", "content": "Aceste cifre nu apar în fișa de date: " + ", ".join(bad)
                                                               + ". Rescrie nota folosind doar cifre copiate exact din fișă."}]
    deterministic = text is None
    if deterministic:
        text = template(board, env, rows)
    board["memo"] = {"text": text, "verified_numbers": len(NUMBER.findall(text)), "unverified": unverified(text, data),
                     "model": None if deterministic else model, "rejected_drafts": len(rejected)}
    summary = (f"Notă de credit redactată de modelul mare; {board['memo']['verified_numbers']} cifre verificate față de fișa de date"
               if not deterministic else f"Notă de credit generată din șablon determinist; {board['memo']['verified_numbers']} cifre, toate din fișa de date")
    if rejected:
        summary += f"; {len(rejected)} variante respinse pentru cifre inexistente"
    B.mark_ran(board, "memo", summary)
    return B.Report(title=summary, model=model, status="ok" if not board["memo"]["unverified"] else "warning",
                    thought=("Variante respinse: cifre fără sursă " + "; ".join(", ".join(b) for b in rejected)) if rejected else None,
                    detail={"deterministic": deterministic, "rejected": rejected})
