from time import perf_counter
from app.core.contracts import FindingSet


def execute(registry, workflow, context, facts):
    ordered = registry.validate(workflow)
    findings, trace = [], []
    failed = set()
    for step in ordered:
        module = registry.get(step.module, step.module_version)
        start = perf_counter()
        event = {"step_id": step.id, "module": module.manifest.model_dump(), "status": "SUCCEEDED"}
        try:
            if any(dep in failed for dep in step.depends_on):
                raise ValueError("DEPENDENCY_FAILED")
            if module.manifest.permission not in context.permissions:
                raise PermissionError("MODULE_PERMISSION_DENIED")
            result = FindingSet.model_validate(module.execute(context, facts, workflow.policy))
            expected = set(module.manifest.rule_ids)
            if {f.rule_id for f in result.findings} != expected or any(f.module_id != step.module for f in result.findings):
                raise ValueError("INCOMPLETE_MODULE_OUTPUT")
            known = {f.evidence.model_dump_json() for f in facts.facts}
            if any(e.model_dump_json() not in known for f in result.findings for e in f.evidence):
                raise ValueError("UNVERIFIED_EVIDENCE")
            if any(f.outcome == "PASS" and not f.evidence for f in result.findings):
                raise ValueError("UNSUPPORTED_PASS")
            findings.extend(result.findings)
            event["output"] = result.model_dump(mode="json")
        except Exception as exc:
            failed.add(step.id)
            event.update(status="FAILED", error_code=str(exc) if str(exc) in {
                "DEPENDENCY_FAILED", "MODULE_PERMISSION_DENIED", "INCOMPLETE_MODULE_OUTPUT",
                "UNVERIFIED_EVIDENCE", "UNSUPPORTED_PASS"} else "MODULE_EXECUTION_FAILED")
        event["duration_ms"] = round((perf_counter() - start) * 1000, 2)
        trace.append(event)
    disposition = None if failed else "ESCALATED" if any(f.outcome == "FAIL" for f in findings) else "NEEDS_INFORMATION" if any(f.outcome == "UNKNOWN" for f in findings) else "READY_FOR_REVIEW"
    return {"status": "PROCESSING_FAILED" if failed else "COMPLETED", "disposition": disposition,
            "scope": "Foundation: VAL-01, CON-02, BUS-05 only. Not a complete KYC review.",
            "processing_mode": facts.extraction_mode,
            "findings": [f.model_dump(mode="json") for f in findings], "trace": trace}
