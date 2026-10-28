"""BUS-05: the registry extract must not be older than the policy limit."""
from datetime import date

from app.core.contracts import FindingSet, Manifest
from app.engine.registry import Module
from app.modules.kyc.common import finding

MODULE_ID, RULE = "kyc.freshness", "BUS-05"


def freshness(ctx, inputs, policy):
    facts = [f for f in inputs.facts if f.field == "extract_date" and ctx.document_kinds.get(f.evidence.document_id) == "company_extract"]
    results = []
    for fact in facts:
        try:
            age = (ctx.evaluation_date - date.fromisoformat(fact.value)).days
            outcome = "UNKNOWN" if age < 0 else "FAIL" if age > policy.max_extract_age_days else "PASS"
            message = f"Vechimea extrasului: {age} zile. Limita politicii demonstrative: {policy.max_extract_age_days} zile."
        except ValueError:
            outcome, message = "UNKNOWN", "Data extrasului nu are formatul acceptat AAAA-LL-ZZ."
        results.append(finding(RULE, MODULE_ID, outcome, message, [fact], fact.entity_id))
    return FindingSet(findings=results or [finding(RULE, MODULE_ID, "UNKNOWN", "Lipsesc dovezile pentru data emiterii extrasului.")])


MODULE = Module(Manifest(id=MODULE_ID, version="0.1.0", rule_ids=[RULE]), freshness)
