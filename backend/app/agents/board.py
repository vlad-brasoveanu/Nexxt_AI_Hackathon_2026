"""The shared board (blackboard) the agents read and write, plus the environment each agent receives.

Every value an agent publishes is a metric or fact with literal evidence; every concern is an issue with references.
Producers bump a version; an agent whose dependencies moved since it last ran is stale and is scheduled again."""
import json
import re
from dataclasses import dataclass, field
from datetime import date
from hashlib import sha256

from app.agents.catalog import AGENTS
from app.db import uid


@dataclass
class Doc:
    id: str
    kind: str
    filename: str
    sha256: str
    pages: list
    media_type: str = "application/pdf"


@dataclass
class Env:
    case: dict                 # id, title, revision, meta
    docs: list[Doc]
    sources: object            # app.credit.sources.Sources
    standards: dict
    market: dict               # index, value_pct, as_of, source
    models: object             # app.ai.ModelRouter
    evaluation_date: date
    timeout: float = 90


@dataclass
class Report:
    title: str
    status: str = "ok"                         # ok | warning | failed | blocked
    thought: str | None = None
    model: dict | None = None
    detail: dict = field(default_factory=dict)
    documents: list = field(default_factory=list)   # new source snapshots: (Doc, bytes)
    duration_ms: float | None = None


def new_board(case: dict, evaluation_date: date) -> dict:
    return {
        "evaluation_date": evaluation_date.isoformat(),
        "versions": {},
        "agents": {a: {"status": "idle", "runs": 0, "last_summary": None, "seen": {}} for a in AGENTS},
        "facts": {}, "metrics": {}, "issues": [], "rules": [], "challenges": [],
        "completeness": None, "financials": None, "cashflow": None, "kyb": None, "analyst": None, "memo": None,
        "security": {"injections": [], "refused_actions": 0},
        "recommendation_history": [],
    }


def bump(board: dict, key: str):
    board["versions"][key] = board["versions"].get(key, 0) + 1


def stale(board: dict, agent: str) -> bool:
    state = board["agents"][agent]
    if state["runs"] == 0:
        return True
    return any(board["versions"].get(dep, 0) != state["seen"].get(dep, 0) for dep in AGENTS[agent].deps)


def mark_ran(board: dict, agent: str, summary: str, status: str = "done"):
    state = board["agents"][agent]
    state["runs"] += 1
    state["status"] = status
    state["last_summary"] = summary
    state["seen"] = {dep: board["versions"].get(dep, 0) for dep in AGENTS[agent].deps}
    bump(board, agent)


def metric(board: dict, id: str, label: str, value: float, unit: str, display: str, agent: str,
           formula: str | None = None, sources: list | None = None):
    previous = board["metrics"].get(id, {})
    board["metrics"][id] = {"id": id, "label": label, "value": value, "unit": unit, "display": display, "agent": agent,
                            "formula": formula, "sources": sources or [], "benchmark": previous.get("benchmark")}


def fact(board: dict, id: str, agent: str, label: str, field_name: str, value: str, evidence: dict,
         normalized: float | None = None, entity: str = "company", method: str = "structured"):
    previous = board["facts"].get(id)
    review = previous["review"] if previous and previous["value"] == value and previous["evidence"] == evidence else "pending"
    board["facts"][id] = {"id": id, "entity_id": entity, "field": field_name, "value": value, "evidence": evidence,
                          "agent": agent, "label": label, "normalized": normalized, "verified": True,
                          "review": review, "conflict": False, "method": method,
                          "corrected_value": previous.get("corrected_value") if previous and review != "pending" else None}


def value_of(board: dict, fact_id: str) -> float | None:
    """A fact's numeric value, honouring an analyst correction."""
    f = board["facts"].get(fact_id)
    if not f or f["review"] == "rejected":
        return None
    if f["review"] == "corrected" and f.get("corrected_value") is not None:
        return f["corrected_value"]
    return f["normalized"]


def issue(board: dict, key: str, agent: str, severity: str, title: str, detail: str, refs=(), client_action: str | None = None):
    """Open (or refresh) an issue identified by a stable key."""
    for existing in board["issues"]:
        if existing["key"] == key:
            if existing["status"] == "resolved":
                existing.update(status="open", resolution=None)
            existing.update(severity=severity, title=title, detail=detail, refs=list(refs), client_action=client_action)
            return existing
    entry = {"id": "I-" + uid()[:8], "key": key, "agent": agent, "severity": severity, "title": title, "detail": detail,
             "refs": list(refs), "status": "open", "resolution": None, "client_action": client_action}
    board["issues"].append(entry)
    return entry


def resolve(board: dict, key: str, resolution: str):
    for existing in board["issues"]:
        if existing["key"] == key and existing["status"] != "resolved":
            existing.update(status="resolved", resolution=resolution)


def open_issues(board: dict, agent: str | None = None):
    return [i for i in board["issues"] if i["status"] != "resolved" and (agent is None or i["agent"] == agent)]


def span(doc: Doc, page: int, start: int, end: int) -> dict:
    return {"document_id": doc.id, "sha256": doc.sha256, "page": page, "start": start, "end": end,
            "quote": doc.pages[page - 1][start:end]}


def label_pattern(label: str) -> re.Pattern:
    """Match a printed label whatever line breaks the PDF text extraction inserted between its words."""
    return re.compile(r"\s+".join(re.escape(word) for word in label.split()))


def snapshot_doc(kind: str, filename: str, payload: dict) -> tuple[Doc, bytes]:
    """A source lookup stored as a case document, so facts can cite it with a hash and a span."""
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    data = text.encode()
    return Doc(id=uid(), kind=kind, filename=filename, sha256=sha256(data).hexdigest(), pages=[text],
               media_type="application/json"), data


def find_in_snapshot(doc: Doc, key: str, value) -> dict | None:
    """Evidence for `"key": value` inside a JSON snapshot document (first occurrence)."""
    text = doc.pages[0]
    literal = json.dumps(value, ensure_ascii=False)
    match = re.search(re.escape(json.dumps(key, ensure_ascii=False)) + r":\s*" + re.escape(literal), text)
    if not match:
        return None
    start = match.end() - len(literal)
    return span(doc, 1, start, match.end())
