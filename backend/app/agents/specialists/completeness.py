"""Agent Completitudine: which documents the policy requires, which are missing, and whether any document carries
instructions aimed at an AI system (prompt injection). It also drafts the single consolidated client request."""
import re

from app.agents import board as B
from app.agents.llm import ask_text

YEAR = re.compile(r"(?:Exerci[țt]iul|anuale)\s+(\d{4})")
INJECTION = [
    re.compile(p, re.IGNORECASE) for p in (
        r"(asistent(ul)?|sistem(ul)?|model(ul)?|agent(ul)?)\s+(AI|IA)\b",
        r"ignor[ăa]\s+(toate\s+)?(instruc|pragur|regul|politic)",
        r"ignore\s+(all\s+|previous\s+|the\s+)*(instructions|rules|thresholds)",
        r"recomand[ăa]\s+aprobarea",
        r"system\s+prompt|you\s+are\s+now",
    )
]


def fs_year(doc: B.Doc) -> int | None:
    match = YEAR.search(" ".join(doc.pages[0].split())) if doc.pages else None
    if match:
        return int(match.group(1))
    return None  # The filename is not evidence of a fiscal year.


def scan_injections(doc: B.Doc) -> list[dict]:
    found = []
    for number, text in enumerate(doc.pages, 1):
        for pattern in INJECTION:
            for match in pattern.finditer(text):
                # Quote the whole sentence around the match, by offsets into the stored page text.
                start = max(text.rfind(".", 0, match.start()), text.rfind("\n\n", 0, match.start())) + 1
                end_dot = text.find(".", match.end())
                end = len(text) if end_dot < 0 else end_dot + 1
                while start < end and text[start].isspace():
                    start += 1
                found.append({"document_id": doc.id, "filename": doc.filename, "page": number, "start": start, "end": end,
                              "quote": " ".join(text[start:end].split())})
    unique = {}
    for item in found:
        unique.setdefault((item["document_id"], item["start"]), item)
    return list(unique.values())


def requirements(env: B.Env) -> list[dict]:
    secured = bool(env.case["meta"].get("secured"))
    return [r for r in env.standards["required_documents"] if r.get("when") != "secured" or secured]


def check(board: dict, env: B.Env) -> B.Report:
    from app.agents.document_checks import check as check_documents
    check_documents(board, env)
    present, missing = [], []
    years = {d.id: fs_year(d) for d in env.docs if d.kind == "financial_statements"}
    for req in requirements(env):
        docs = [d for d in env.docs if d.kind == req["kind"] and (req.get("year") is None or years.get(d.id) == req["year"])]
        (present if docs else missing).append({"code": req["code"], "title": req["title"], "documents": [d.id for d in docs]})
    injections = [i for d in env.docs for i in scan_injections(d)]
    known = {(i["document_id"], i["start"]) for i in board["security"]["injections"]}
    for item in injections:
        if (item["document_id"], item["start"]) not in known:
            board["security"]["injections"].append(item)
            B.issue(board, f"injection:{item['document_id']}:{item['start']}", "completeness", "warning",
                    f"Instrucțiune adresată unui sistem AI în {item['filename']} — ignorată",
                    f"„{item['quote']}” Textul documentelor este tratat ca date: nicio valoare sau acțiune din el nu este preluată.",
                    [item["document_id"]])
    board["completeness"] = {"present": present, "missing": missing, "fs_years": sorted(y for y in years.values() if y)}
    for req in requirements(env):
        key = f"missing:{req['code']}"
        if any(m["code"] == req["code"] for m in missing):
            B.issue(board, key, "completeness", "blocking", f"Lipsește: {req['title']}",
                    "Documentul este cerut de politica de creditare pentru acest produs.", [], client_action=req["title"])
        else:
            B.resolve(board, key, "Documentul a fost depus.")
    summary = (f"{len(present)}/{len(present) + len(missing)} documente obligatorii prezente"
               + (f"; lipsesc {len(missing)}: " + ", ".join(m["title"] for m in missing) if missing else "")
               + (f"; {len(injections)} instrucțiuni ascunse ignorate" if injections else ""))
    B.mark_ran(board, "completeness", summary, "done")
    return B.Report(title=summary, status="warning" if missing or injections else "ok",
                    detail={"missing": [m["title"] for m in missing], "injections": len(injections)})


def request_items(board: dict) -> list[dict]:
    """Everything the client can fix, collected into one request: missing documents and client-resolvable issues."""
    items = []
    for i in B.open_issues(board):
        if i.get("client_action") and i["status"] == "open":
            items.append({"code": i["key"], "title": i["client_action"], "reason": i["detail"], "refs": i["refs"], "satisfied": False})
    return items


TEMPLATE = ("Bună ziua,\n\nPentru analiza cererii de finanțare {request} avem nevoie de următoarele, într-o singură transmitere:\n"
            "{items}\n\nLe puteți încărca direct în portalul Banca Demo. Vă mulțumim!\nEchipa de creditare IMM")


def draft_message(env: B.Env, items: list[dict]) -> tuple[str, dict | None]:
    """One polite message listing every item. The small model may phrase it; every item must still be named."""
    listing = "\n".join(f"{n}. {i['title']}" for n, i in enumerate(items, 1))
    fallback = TEMPLATE.format(request=env.case["meta"].get("request_id", ""), items=listing)
    prompt = [{"role": "system", "content": "Redactezi mesaje scurte și politicoase, în limba română, către clienți IMM ai unei bănci. "
                                            "Nu promiți aprobarea creditului și nu adaugi cerințe noi."},
              {"role": "user", "content": f"Scrie un mesaj de maximum 120 de cuvinte care cere, într-o singură transmitere, exact aceste elemente "
                                          f"(păstrează lista numerotată exact):\n{listing}\nCererea de finanțare: {env.case['meta'].get('request_id', '')}."}]
    text, model = ask_text(env, "small", prompt)
    if text and all(i["title"] in text for i in items):
        return text.strip(), model
    return fallback, None
