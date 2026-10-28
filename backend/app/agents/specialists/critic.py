"""Agent Critic: challenges the other agents' conclusions by cross-checking them, and asks for re-verification.
Challenges become eligible tasks for the orchestrator; client-resolvable gaps become items of the consolidated request."""
from app.agents import board as B
from app.agents.specialists.cashflow import norm


def challenge(board: dict, task: str, reason: str, key: str):
    for c in board["challenges"]:
        if c["key"] == key and c["status"] == "open":
            return None
    entry = {"id": "C-" + str(len(board["challenges"]) + 1), "key": key, "task": task, "reason": reason, "status": "open"}
    board["challenges"].append(entry)
    return entry


def review(board: dict, env: B.Env) -> B.Report:
    raised, notes = [], []
    cf, kyb = board.get("cashflow"), board.get("kyb")
    gap_open = any(i["key"] == "cashflow:turnover-gap" and i["status"] != "resolved" for i in board["issues"])

    if cf and gap_open:
        if kyb is None:
            if cf.get("two_way"):
                names = ", ".join(t["name"] for t in cf["two_way"])
                c = challenge(board, "kyb.investigate", f"Încasările nu se reconciliază, iar {names} are fluxuri mari în ambele sensuri: "
                                                        "verifică în registru dacă este entitate afiliată.", "gap:kyb")
                raised += [c] if c else []
        else:
            affiliates = {norm(n["label"]): n["label"] for n in kyb["nodes"] if "afiliat" in n.get("flags", [])}
            unseen = [label for key, label in affiliates.items() if key not in set(cf.get("affiliates_used", []))]
            if unseen:
                flows = {t["name"]: t for t in cf.get("two_way", [])}
                detail = "; ".join(f"{n}: +{flows[n]['in']:,} / −{flows[n]['out']:,} RON".replace(",", ".") for n in unseen if n in flows)
                c = challenge(board, "cashflow.analyze",
                              f"Contest concluzia Agentului Fluxuri: diferența față de cifra de afaceri include fluxuri cu {', '.join(unseen)}, "
                              f"pe care Agentul KYB a identificat-o ca afiliată (control comun). {detail}. Reclasifică fluxurile intragrup.", "gap:reclassify")
                raised += [c] if c else []
            else:
                B.issue(board, "critic:gap-explanation", "critic", "warning", "Diferență neexplicată între încasări și cifra de afaceri",
                        "Persistă după excluderea fluxurilor intragrup, de la asociați și de finanțare.", ["turnover_gap_pct"],
                        client_action="Explicație pentru diferența dintre încasările din extrase și cifra de afaceri (sau extrase de la celelalte bănci)")
    if not gap_open:
        B.resolve(board, "critic:gap-explanation", "Încasările se reconciliază cu cifra de afaceri.")

    memo = board.get("memo")
    if memo and memo.get("unverified"):
        c = challenge(board, "memo.draft", "Nota de credit conține cifre fără sursă: " + ", ".join(memo["unverified"]), "memo:numbers")
        raised += [c] if c else []

    rec = board.get("recommendation")
    if rec and rec["decision"] in {"APPROVE", "APPROVE_WITH_CONDITIONS"} and any(r["outcome"] == "FAIL" for r in board["rules"]):
        c = challenge(board, "policy.evaluate", "Recomandare favorabilă cu reguli eșuate: re-evaluează politica.", "policy:consistency")
        raised += [c] if c else []

    injected = board["security"]["injections"]
    if injected:
        values = {m["display"] for m in board["metrics"].values()}
        used = [i for i in injected if any(v and v.split()[0] in i["quote"] for v in values if v[0].isdigit() and len(v.split()[0]) > 3)]
        notes.append(f"{len(injected)} instrucțiuni ascunse în documente; nicio valoare din ele nu a ajuns în indicatori." if not used
                     else "Atenție: o valoare din textul suspect coincide cu un indicator — verificare manuală.")
    no_source = [m["label"] for m in board["metrics"].values() if not m["sources"] and m["agent"] not in {"policy"}]
    if no_source:
        notes.append("Indicatori fără sursă literală: " + ", ".join(no_source[:4]))

    B.mark_ran(board, "critic", f"{len(raised)} contestări" if raised else "Nicio contradicție între agenți")
    if raised:
        return B.Report(title=f"{len(raised)} {'contestare' if len(raised) == 1 else 'contestări'}: " + "; ".join(c["task"] for c in raised),
                        status="warning", thought=" ".join(c["reason"] for c in raised), detail={"challenges": raised, "notes": notes})
    return B.Report(title="Nicio contradicție între concluziile agenților", thought=" ".join(notes) or None, detail={"notes": notes})
