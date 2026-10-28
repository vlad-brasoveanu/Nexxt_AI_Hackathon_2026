"""Agent Fluxuri de numerar: reads the bank statement export (CSV), classifies inflows and outflows, reconciles
operating receipts with the turnover in the financial statements and measures client concentration.

Counterparties the KYB agent has identified as connected (group companies, shareholders) are excluded from operating
inflows when that information is on the board at run time; the Critic checks whether a later KYB result changes it."""
import csv
import io
import unicodedata
from collections import defaultdict

from app.agents import board as B
from app.credit.numbers import fmt_pct, fmt_ron, parse_ro

LABELS = {"operating": "Încasări operaționale (clienți)", "intragroup": "Intragrup (entități afiliate)",
          "shareholder": "De la asociați", "financing": "Finanțări și dobânzi", "other": "Altele"}


def norm(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return " ".join(plain.replace(".", " ").replace(",", " ").split())


def rows(doc: B.Doc):
    """Statement rows with the character offsets of their amount cells, for evidence spans."""
    text = doc.pages[0]
    lines, offset = [], 0
    for line in text.splitlines(keepends=True):
        lines.append((offset, line))
        offset += len(line)
    header = None
    for start, line in lines:
        cells = next(csv.reader(io.StringIO(line), delimiter=";"), [])
        if not cells:
            continue
        if header is None:
            header = [c.strip().lower() for c in cells]
            continue
        row = dict(zip(header, cells))
        for side in ("credit", "debit"):
            raw = (row.get(side) or "").strip()
            if not raw:
                continue
            amount = parse_ro(raw)
            if amount is None:
                continue
            col = header.index(side)
            cell_start = start + len(";".join(cells[:col])) + (1 if col else 0)
            if text[cell_start:cell_start + len(raw)] != raw:  # quoted cells shift offsets: locate the cell in its line
                cell_start = start + line.rfind(raw)
            yield {"date": row.get("data", ""), "description": row.get("descriere", ""), "counterparty": row.get("contrapartida", ""),
                   "side": side, "amount": amount, "evidence": B.span(doc, 1, cell_start, cell_start + len(raw))}


def classify(row: dict, affiliates: set[str], shareholders: set[str]) -> str:
    who, what = norm(row["counterparty"]), norm(row["description"])
    if any(a and a in who for a in affiliates):
        return "intragroup"
    if any(s and s in who for s in shareholders) or "imprumut asociat" in what or "aport" in what:
        return "shareholder"
    if "tragere credit" in what or "dobanda" in what or "restituire" in what:
        return "financing"
    if row["side"] == "credit":
        return "operating"
    return "other"


def analyze(board: dict, env: B.Env) -> B.Report:
    docs = [d for d in env.docs if d.kind == "bank_statement"]
    if not docs:
        B.mark_ran(board, "cashflow", "Nu există extrase de cont în dosar")
        return B.Report(title="Nu există extrase de cont în dosar", status="warning")
    kyb = board.get("kyb") or {}
    affiliates = {norm(n["label"]) for n in kyb.get("nodes", []) if n["type"] == "company" and "afiliat" in n.get("flags", [])}
    shareholders = {norm(u["name"]) for u in kyb.get("ubo", [])} | {norm(" ".join(reversed(u["name"].split()))) for u in kyb.get("ubo", [])}
    totals = defaultdict(float)
    by_counterparty = defaultdict(lambda: {"in": 0.0, "out": 0.0, "rows": []})
    monthly = defaultdict(lambda: {"inflow": 0.0, "outflow": 0.0, "operating_inflow": 0.0})
    top_rows = defaultdict(list)
    for doc in docs:
        for row in rows(doc):
            month = row["date"][3:10] if len(row["date"]) >= 10 else "?"
            cls = classify(row, affiliates, shareholders)
            party = by_counterparty[row["counterparty"].strip() or "—"]
            if row["side"] == "credit":
                totals["inflow"] += row["amount"]
                totals[cls] += row["amount"]
                monthly[month]["inflow"] += row["amount"]
                party["in"] += row["amount"]
                if cls == "operating":
                    monthly[month]["operating_inflow"] += row["amount"]
                top_rows[cls].append(row)
            else:
                totals["outflow"] += row["amount"]
                monthly[month]["outflow"] += row["amount"]
                party["out"] += row["amount"]
            party["rows"].append(row)

    def top_evidence(cls, n=6):
        return [r["evidence"] for r in sorted(top_rows[cls], key=lambda r: -r["amount"])[:n]]

    operating = totals["operating"]
    clients = sorted(((name, p["in"]) for name, p in by_counterparty.items()
                      if p["in"] and any(classify(r, affiliates, shareholders) == "operating" for r in p["rows"] if r["side"] == "credit")),
                     key=lambda x: -x[1])
    B.metric(board, "inflows_total", "Încasări totale în extrase", totals["inflow"], "RON", fmt_ron(totals["inflow"]), "cashflow",
             "Suma creditărilor din extrasele de cont", top_evidence("operating", 3) + top_evidence("intragroup", 2))
    B.metric(board, "operating_inflows", "Încasări operaționale", operating, "RON", fmt_ron(operating), "cashflow",
             "Încasări fără intragrup, asociați, finanțări și dobânzi", top_evidence("operating"))
    latest = (board.get("financials") or {}).get("latest")
    revenue = B.value_of(board, f"fs{latest}-revenue") if latest else None
    gap = None
    tolerance = env.standards["thresholds"]["turnover_gap_tolerance_pct"]
    if revenue:
        gap = (operating / revenue - 1) * 100
        B.metric(board, "turnover_gap_pct", "Încasări operaționale față de cifra de afaceri", round(gap, 1), "%", fmt_pct(gap), "cashflow",
                 f"Încasări operaționale / cifra de afaceri {latest} − 1",
                 top_evidence("operating", 3) + [board["facts"][f"fs{latest}-revenue"]["evidence"]])
        key = "cashflow:turnover-gap"
        if abs(gap) > tolerance:
            B.issue(board, key, "cashflow", "warning", f"Încasările operaționale diferă cu {fmt_pct(gap)} de cifra de afaceri {latest}",
                    f"Toleranța politicii este ± {fmt_pct(tolerance, 0)}. Clasificarea folosește {len(affiliates)} entități afiliate cunoscute.",
                    ["operating_inflows", "turnover_gap_pct"])
        else:
            B.resolve(board, key, f"După reclasificare diferența este {fmt_pct(gap)}, în toleranța de ± {fmt_pct(tolerance, 0)}.")
    concentration = None
    if clients and operating:
        name, amount = clients[0]
        concentration = amount / operating * 100
        B.metric(board, "client_concentration_pct", "Concentrare pe clientul principal", round(concentration, 1), "%", fmt_pct(concentration),
                 "cashflow", f"Încasări de la {name} / încasări operaționale",
                 [r["evidence"] for r in by_counterparty[name]["rows"] if r["side"] == "credit"][:6])
    two_way = [{"name": n, "in": round(p["in"]), "out": round(p["out"])} for n, p in by_counterparty.items()
               if totals["inflow"] and p["in"] >= 0.05 * totals["inflow"] and p["out"] >= 0.05 * totals["outflow"]]
    board["cashflow"] = {
        "period": f"{min(monthly)} – {max(monthly)}" if monthly else "",
        "monthly": [{"month": m, **{k: round(v) for k, v in vals.items()}} for m, vals in sorted(monthly.items(), key=lambda x: x[0][3:] + x[0][:2])],
        "classes": [{"key": k, "label": LABELS[k], "amount": round(totals[k]), "share_pct": round(totals[k] / totals["inflow"] * 100, 1) if totals["inflow"] else 0}
                    for k in LABELS if totals[k]],
        "top_clients": [{"name": n, "amount": round(a), "share_pct": round(a / operating * 100, 1)} for n, a in clients[:6]] if operating else [],
        "two_way": two_way,
        "affiliates_used": sorted(affiliates),
        "top_client": clients[0][0] if clients else None,
    }
    summary = (f"Încasări {fmt_ron(totals['inflow'])}, din care operaționale {fmt_ron(operating)}"
               + (f" ({fmt_pct(gap)} față de CA)" if gap is not None else "")
               + (f"; client principal {clients[0][0]} {fmt_pct(concentration)}" if clients else ""))
    B.mark_ran(board, "cashflow", summary)
    thought = None
    if two_way:
        thought = "Contrapartide cu fluxuri mari în ambele sensuri: " + ", ".join(f"{t['name']} (+{fmt_ron(t['in'])} / −{fmt_ron(t['out'])})" for t in two_way)
    return B.Report(title=summary, status="warning" if gap is not None and abs(gap) > tolerance else "ok", thought=thought,
                    detail={"gap_pct": gap, "affiliates_used": sorted(affiliates), "two_way": two_way})
