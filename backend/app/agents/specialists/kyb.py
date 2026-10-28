"""Agent KYB/Diligență: shareholders and beneficial owners from the registry, connected companies (control ≥ 50%),
group exposure at this bank, the credit bureau report, sanctions screening and the KYC checks (VAL-01, CON-02, BUS-05)
reused from the onboarding engine. Every lookup is stored as a source document so its values carry evidence."""
import re
import unicodedata
from datetime import date
from difflib import SequenceMatcher

from app.agents import board as B
from app.core.contracts import Context, Evidence, Fact, FactSet
from app.credit.numbers import fmt_ron
from app.engine.runner import execute
from app.engine.workflows import default_registry, foundation_workflow

CUI = re.compile(r"(?:company_identifier:|Cod\s+unic\s+de\s+înregistrare(?:\s*\(CUI\))?|\bCUI\b)\s*:?\s*(?:RO\s*)?(\d{6,10})")
LINES = {"extract_date": re.compile(r"extract_date:\s*(\d{4}-\d{2}-\d{2})"),
         "identity_expiry": re.compile(r"identity_expiry:\s*(\d{4}-\d{2}-\d{2})")}
CLIENT_ACTION = {
    "CON-02": "Confirmarea codului unic de înregistrare (diferă între cerere și certificatul ONRC)",
    "VAL-01": "Act de identitate valabil al administratorului",
    "BUS-05": "Certificat constatator ONRC emis în ultimele 90 de zile",
}


def norm(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", plain).split())


def find_after(doc: B.Doc, anchor: str, key: str, value, start: int = 0) -> dict | None:
    import json
    text = doc.pages[0]
    at = text.find(anchor, start) if anchor else start
    if at < 0:
        return None
    literal = json.dumps(value, ensure_ascii=False)
    match = re.compile(re.escape(json.dumps(key)) + r":\s*" + re.escape(literal)).search(text, at)
    if not match:
        return None
    return B.span(doc, 1, match.end() - len(literal), match.end())


def first(pattern: re.Pattern, doc: B.Doc):
    for number, text in enumerate(doc.pages, 1):
        match = pattern.search(text)
        if match:
            return match.group(1), B.span(doc, number, match.start(1), match.end(1))
    return None


def kyc_facts(board: dict, env: B.Env) -> list[Fact]:
    facts = []
    for doc in env.docs:
        found = []
        if doc.kind in {"credit_application", "company_extract"}:
            found.append(("company_identifier", "company", first(CUI, doc)))
        if doc.kind == "company_extract":
            found.append(("extract_date", "company", first(LINES["extract_date"], doc)))
        if doc.kind == "identity":
            found.append(("identity_expiry", f"person-{doc.id[:6]}", first(LINES["identity_expiry"], doc)))
        for field_name, entity, hit in found:
            if not hit:
                continue
            value, evidence = hit
            fid = f"kyc-{doc.kind}-{field_name}-{doc.id[:6]}"
            label = {"company_identifier": "CUI", "extract_date": "Data certificatului ONRC", "identity_expiry": "Expirarea actului de identitate"}[field_name]
            B.fact(board, fid, "kyb", f"{label} · {doc.filename}", field_name, value, evidence, entity=entity)
            facts.append(Fact(id=fid, entity_id=entity, field=field_name, value=value, evidence=Evidence(**evidence)))
    return facts


def investigate(board: dict, env: B.Env) -> B.Report:
    meta, sources = env.case["meta"], env.sources
    cui = meta.get("cui", "")
    new_docs, existing = [], {(d.kind, d.sha256): d for d in env.docs}

    def stored(kind, filename, payload):
        doc, data = B.snapshot_doc(kind, filename, payload)
        if (kind, doc.sha256) in existing:
            return existing[(kind, doc.sha256)]
        new_docs.append((doc, data))
        existing[(kind, doc.sha256)] = doc
        return doc

    company = sources.company(cui)
    if not company:
        B.issue(board, "kyb:registry", "kyb", "blocking", "Societatea nu apare în registrul comerțului", f"CUI {cui} nu a fost găsit.", [])
        B.mark_ran(board, "kyb", "Societatea nu apare în registru", "blocked")
        return B.Report(title=f"CUI {cui} negăsit în registru", status="blocked")
    B.resolve(board, "kyb:registry", "Societatea a fost găsită în registru.")
    ubo = [s for s in company["shareholders"] if s["type"] == "person" and s["share_pct"] >= 25]
    persons = {norm(s["name"]): s["name"] for s in company["shareholders"] if s["type"] == "person"}
    related, nodes, edges = [], [{"id": cui, "label": company["name"], "type": "applicant", "flags": ["solicitant"], "exposure": None}], []
    for s in company["shareholders"]:
        pid = "p:" + norm(s["name"])
        nodes.append({"id": pid, "label": s["name"], "type": "person" if s["type"] == "person" else "company",
                      "flags": ["beneficiar real"] if s in ubo else [], "exposure": None})
        edges.append({"source": pid, "target": cui, "label": f"{s['share_pct']}%", "share_pct": s["share_pct"]})
    for other in sources.registry()["companies"]:
        if other["cui"] == cui:
            continue
        links = [(persons[norm(s["name"])], s["share_pct"]) for s in other["shareholders"] if norm(s["name"]) in persons]
        if not links:
            continue
        control = any(share >= 50 for _, share in links)
        related.append({"company": other, "links": links, "control": control})
        nodes.append({"id": other["cui"], "label": other["name"], "type": "company",
                      "flags": ["afiliat"] if control else ["legătură minoritară"], "exposure": None})
        for person, share in links:
            edges.append({"source": "p:" + norm(person), "target": other["cui"], "label": f"{share}%", "share_pct": share})
    registry_doc = stored("source_registry", f"registru-onrc-{cui}.json",
                          {"sursa": sources.registry()["source"], "solicitant": company, "entitati_legate": [r["company"] for r in related]})

    group = [cui] + [r["company"]["cui"] for r in related if r["control"]]
    exposures = sources.exposures()
    group_rows = {c: exposures["clients"][c] for c in group if c in exposures["clients"]}
    exposure_doc = stored("source_exposures", f"expuneri-grup-{cui}.json", {"sursa": exposures["source"], "grup": group, "expuneri": group_rows})
    group_exposure, exposure_evidence = 0.0, []
    for client_cui, client in group_rows.items():
        for facility in client["facilities"]:
            group_exposure += facility["approved_ron"]
            ev = find_after(exposure_doc, f'"{client_cui}"', "approved_ron", facility["approved_ron"])
            if ev:
                exposure_evidence.append(ev)
        for n in nodes:
            if n["id"] == client_cui:
                n["exposure"] = sum(f["approved_ron"] for f in client["facilities"])
    B.metric(board, "group_exposure", "Expunere existentă a grupului la Banca Demo", group_exposure, "RON", fmt_ron(group_exposure), "kyb",
             "Suma limitelor aprobate pentru entitățile aflate sub control comun", exposure_evidence)

    founded = date.fromisoformat(company["founded"])
    years = round((env.evaluation_date - founded).days / 365.25, 1)
    ev = find_after(registry_doc, '"solicitant"', "founded", company["founded"])
    B.metric(board, "years_in_business", "Vechime în activitate", years, "ani", f"{years:.1f} ani".replace(".", ","), "kyb",
             f"De la înființare ({company['founded']}) la data evaluării", [ev] if ev else [])

    report = sources.bureau(cui)
    existing_service, max_dpd, bureau_ev, dpd_ev = 0.0, 0, [], []
    if report:
        bureau_doc = stored("source_bureau", f"biroul-de-credit-{cui}.json", {"cui": cui, **report})
        position = 0
        for facility in report["facilities"]:
            existing_service += facility["monthly_installment_ron"] * 12
            max_dpd = max(max_dpd, facility["max_dpd_12m"])
            anchor = bureau_doc.pages[0].find(f'"{facility["lender"]}"', position)
            position = max(anchor, position)
            for key, bucket in (("monthly_installment_ron", bureau_ev), ("max_dpd_12m", dpd_ev)):
                hit = find_after(bureau_doc, "", key, facility[key], position)
                if hit:
                    bucket.append(hit)
            position += 1
        B.metric(board, "existing_service", "Serviciul anual al datoriilor existente", existing_service, "RON", fmt_ron(existing_service), "kyb",
                 "Ratele lunare raportate la Biroul de Credit × 12", bureau_ev)
        B.metric(board, "bureau_max_dpd", "Restanța maximă în ultimele 12 luni", max_dpd, "zile", f"{max_dpd} zile", "kyb",
                 "Maximul zilelor de întârziere raportate", dpd_ev)
        if max_dpd >= env.standards["thresholds"]["bureau_dpd_max"]:
            B.issue(board, "kyb:bureau", "kyb", "blocking", f"Restanță de {max_dpd} de zile la Biroul de Credit",
                    "Raportată în ultimele 12 luni.", ["bureau_max_dpd"])
        else:
            B.resolve(board, "kyb:bureau", "Fără restanțe semnificative.")

    if not report:
        B.issue(board, "kyb:missing-bureau", "kyb", "blocking", "Lipsește raportul de credit", "Datoriile și restanțele nu pot fi presupuse zero.")

    administrators = [a["name"] if isinstance(a, dict) else str(a) for a in company.get("administrators", [])]
    names = [company["name"]] + [s["name"] for s in company["shareholders"]] + administrators \
        + [r["company"]["name"] for r in related if r["control"]]
    entries = sources.sanctions()
    hits = []
    for name in dict.fromkeys(names):
        for entry in entries["entries"]:
            score = SequenceMatcher(None, norm(name), norm(entry["name"])).ratio()
            if score >= 0.88:
                hits.append({"name": name, "match": entry["name"], "score": round(score, 2)})
    stored("source_sanctions", f"screening-sanctiuni-{cui}.json",
           {"sursa": entries["source"], "nume_verificate": list(dict.fromkeys(names)), "potriviri": hits})
    if hits:
        B.issue(board, "kyb:sanctions", "kyb", "blocking", "Potriviri în listele de sancțiuni",
                "; ".join(f"{h['name']} ~ {h['match']} ({h['score']})" for h in hits) + ". Clarificarea aparține echipei de conformitate.", [])
    else:
        B.resolve(board, "kyb:sanctions", "Nicio potrivire.")

    facts = kyc_facts(board, env)
    kinds = {d.id: ("application" if d.kind == "credit_application" else d.kind) for d in env.docs}
    context = Context(actor_id="agent-kyb", case_id=env.case["id"], evaluation_date=env.evaluation_date,
                      permissions=frozenset({"case.analyze"}), document_kinds=kinds)
    result = execute(default_registry(), foundation_workflow(), context, FactSet(extraction_mode="manual_structured", facts=facts))
    checks = [{"rule_id": f["rule_id"], "outcome": f["outcome"], "detail": f["explanation"]} for f in result["findings"]]
    for rule_id, action in CLIENT_ACTION.items():
        failing = [c for c in checks if c["rule_id"] == rule_id and c["outcome"] in {"FAIL", "UNKNOWN"}]
        if failing:
            B.issue(board, f"kyc:{rule_id}", "kyb", "blocking", f"KYC {rule_id}: {failing[0]['detail']}",
                    "Verificare reutilizată din motorul de onboarding KYC.", ["kyc"], client_action=action)
        else:
            B.resolve(board, f"kyc:{rule_id}", "Verificarea trece.")
    for n in nodes:
        if n["type"] == "applicant":
            n["exposure"] = None
    board["kyb"] = {
        "nodes": nodes, "edges": edges,
        "ubo": [{"name": s["name"], "share_pct": s["share_pct"], "via": "deținere directă"} for s in ubo],
        "group_exposure": group_exposure, "sanctions_hits": len(hits), "kyc_checks": checks,
        "group": group, "existing_service": existing_service, "bureau_max_dpd": max_dpd if report else None,
        "kyc_failed": [f"{c['rule_id']}: {c['detail']}" for c in checks if c["outcome"] == "FAIL"],
        # A knock-out no document can fix: the orchestrator then does not ask the client for anything.
        "knockout": bool(hits) or (report is not None and max_dpd >= env.standards["thresholds"]["bureau_dpd_knockout"]),
    }
    affiliates = [r["company"]["name"] for r in related if r["control"]]
    summary = (f"{len(ubo)} beneficiari reali; " + (f"afiliați: {', '.join(affiliates)}; " if affiliates else "fără entități afiliate; ")
               + f"expunere de grup {fmt_ron(group_exposure)}; Biroul de Credit: restanță max. {max_dpd} zile; "
               + f"sancțiuni: {len(hits)} potriviri; KYC: " + ", ".join(f"{c['rule_id']} {c['outcome']}" for c in checks))
    blocking = bool(hits) or any(c["outcome"] == "FAIL" for c in checks) or max_dpd >= env.standards["thresholds"]["bureau_dpd_max"]
    B.mark_ran(board, "kyb", summary)
    return B.Report(title=summary, status="warning" if blocking else "ok", documents=new_docs,
                    thought=(f"{affiliates[0]} este controlată de un beneficiar real al solicitantului: intră în grupul de clienți aflați în legătură."
                             if affiliates else None),
                    detail={"affiliates": affiliates, "sanctions_hits": len(hits), "documents_stored": [d.filename for d, _ in new_docs]})
