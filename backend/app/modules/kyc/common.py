from app.core.contracts import Finding


def finding(rule, module, outcome, explanation, facts=(), entity=None):
    return Finding(rule_id=rule, module_id=module, outcome=outcome,
                   severity="info" if outcome == "PASS" else "blocking",
                   explanation=explanation,
                   required_action="Verifică dovezile înainte de revizuirea dosarului." if outcome == "PASS" else "Revizuiește sau adaugă documentul justificativ.",
                   evidence=[f.evidence for f in facts], entity_id=entity)
