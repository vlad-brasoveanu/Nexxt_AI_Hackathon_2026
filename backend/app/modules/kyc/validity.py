"""VAL-01: the identity document must be valid on the evaluation date."""
from datetime import date

from app.core.contracts import FindingSet, Manifest
from app.engine.registry import Module
from app.modules.kyc.common import finding

MODULE_ID, RULE = "kyc.validity", "VAL-01"


def expiry(ctx, inputs, policy):
    facts = [f for f in inputs.facts if f.field == "identity_expiry" and ctx.document_kinds.get(f.evidence.document_id) == "identity"]
    results = []
    for fact in facts:
        try:
            expired = date.fromisoformat(fact.value) < ctx.evaluation_date
            outcome, message = ("FAIL", "Actul de identitate este expirat la data evaluării.") if expired else ("PASS", "Actul de identitate este în termen la data evaluării.")
        except ValueError:
            outcome, message = "UNKNOWN", "Data expirării nu are formatul acceptat AAAA-LL-ZZ."
        results.append(finding(RULE, MODULE_ID, outcome, message, [fact], fact.entity_id))
    return FindingSet(findings=results or [finding(RULE, MODULE_ID, "UNKNOWN", "Lipsesc dovezile pentru data expirării actului de identitate.")])


MODULE = Module(Manifest(id=MODULE_ID, version="0.1.0", rule_ids=[RULE]), expiry)
