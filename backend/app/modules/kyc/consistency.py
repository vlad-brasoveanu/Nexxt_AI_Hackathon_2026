"""CON-02: the company identifier must agree between the application and the registry extract."""
import unicodedata

from app.core.contracts import FindingSet, Manifest
from app.engine.registry import Module
from app.modules.kyc.common import finding

MODULE_ID, RULE = "kyc.consistency", "CON-02"


def identifier(ctx, inputs, policy):
    facts = [f for f in inputs.facts if f.field == "company_identifier"]
    entities = sorted({f.entity_id for f in facts})
    results = []
    for entity in entities:
        group = [f for f in facts if f.entity_id == entity]
        kinds = {ctx.document_kinds.get(f.evidence.document_id) for f in group}
        values = {unicodedata.normalize("NFKC", f.value).strip().upper().replace(" ", "") for f in group}
        if len(values) > 1:
            outcome, message = "FAIL", "Identificatorul companiei diferă între documentele furnizate."
        elif not {"application", "company_extract"}.issubset(kinds):
            outcome, message = "UNKNOWN", "Sunt necesare dovezi atât din cerere, cât și din extrasul companiei."
        else:
            outcome, message = "PASS", "Identificatorii coincid în cerere și extras. Cifra de control nu este verificată de acest modul."
        results.append(finding(RULE, MODULE_ID, outcome, message, group, entity))
    return FindingSet(findings=results or [finding(RULE, MODULE_ID, "UNKNOWN", "Lipsesc dovezile pentru identificatorul companiei.")])


MODULE = Module(Manifest(id=MODULE_ID, version="0.1.0", rule_ids=[RULE]), identifier)
