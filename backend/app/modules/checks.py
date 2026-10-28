from datetime import date
import unicodedata

from app.contracts import Finding, FindingSet, Manifest, Step, Workflow
from app.modules.registry import Module, Registry


def finding(rule, module, outcome, explanation, facts=(), entity=None):
    return Finding(rule_id=rule, module_id=module, outcome=outcome,
                   severity="info" if outcome == "PASS" else "blocking",
                   explanation=explanation,
                   required_action="Verifică dovezile înainte de revizuirea dosarului." if outcome == "PASS" else "Revizuiește sau adaugă documentul justificativ.",
                   evidence=[f.evidence for f in facts], entity_id=entity)


def expiry(ctx, inputs, policy):
    facts = [f for f in inputs.facts if f.field == "identity_expiry" and ctx.document_kinds.get(f.evidence.document_id) == "identity"]
    results = []
    for fact in facts:
        try:
            expired = date.fromisoformat(fact.value) < ctx.evaluation_date
            outcome, message = ("FAIL", "Actul de identitate este expirat la data evaluării.") if expired else ("PASS", "Actul de identitate este în termen la data evaluării.")
        except ValueError:
            outcome, message = "UNKNOWN", "Data expirării nu are formatul acceptat AAAA-LL-ZZ."
        results.append(finding("VAL-01", "kyc.validity", outcome, message, [fact], fact.entity_id))
    return FindingSet(findings=results or [finding("VAL-01", "kyc.validity", "UNKNOWN", "Lipsesc dovezile pentru data expirării actului de identitate.")])


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
        results.append(finding("CON-02", "kyc.consistency", outcome, message, group, entity))
    return FindingSet(findings=results or [finding("CON-02", "kyc.consistency", "UNKNOWN", "Lipsesc dovezile pentru identificatorul companiei.")])


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
        results.append(finding("BUS-05", "kyc.freshness", outcome, message, [fact], fact.entity_id))
    return FindingSet(findings=results or [finding("BUS-05", "kyc.freshness", "UNKNOWN", "Lipsesc dovezile pentru data emiterii extrasului.")])


def default_registry():
    registry = Registry()
    for name, rule, handler in [("kyc.validity", "VAL-01", expiry), ("kyc.consistency", "CON-02", identifier), ("kyc.freshness", "BUS-05", freshness)]:
        registry.register(Module(Manifest(id=name, version="0.1.0", rule_ids=[rule]), handler))
    return registry


def foundation_workflow():
    return Workflow(id="ro.sme.foundation", version="0.1.0", steps=[
        Step(id="validity", module="kyc.validity", module_version="0.1.0"),
        Step(id="consistency", module="kyc.consistency", module_version="0.1.0"),
        Step(id="freshness", module="kyc.freshness", module_version="0.1.0"),
    ])
