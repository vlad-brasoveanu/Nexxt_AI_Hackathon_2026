from datetime import date
import pytest
from app.core.contracts import Context, FactSet, Finding, FindingSet, Manifest, Step
from app.engine.workflows import default_registry, foundation_workflow
from app.engine.registry import Module
from app.engine.runner import execute


def context():
    return Context(actor_id="test", case_id="test", evaluation_date=date(2026, 10, 28), permissions=frozenset({"case.analyze"}), document_kinds={})


@pytest.mark.parametrize("problem", ["cycle", "missing", "schema", "version", "duplicate"])
def test_invalid_workflows_rejected(problem):
    workflow = foundation_workflow()
    if problem == "cycle":
        workflow.steps[0].depends_on = [workflow.steps[0].id]
    elif problem == "missing":
        workflow.steps[0].depends_on = ["does-not-exist"]
    elif problem == "schema":
        workflow.steps[0].input_schema = "Unknown.v1"
    elif problem == "version":
        workflow.steps[0].module_version = "999"
    else:
        workflow.steps.append(workflow.steps[0])
    with pytest.raises(ValueError):
        default_registry().validate(workflow)


def test_new_module_runs_without_runner_changes():
    registry, workflow = default_registry(), foundation_workflow()
    registry.register(Module(Manifest(id="test.extension", version="1", rule_ids=["TEST-01"]),
        lambda ctx, data, policy: FindingSet(findings=[Finding(rule_id="TEST-01", module_id="test.extension", outcome="UNKNOWN", severity="blocking", explanation="Need supporting evidence", required_action="Supply evidence")])) )
    workflow.steps.append(Step(id="extension", module="test.extension", module_version="1", depends_on=["validity"]))
    result = execute(registry, workflow, context(), FactSet(facts=[]))
    assert result["status"] == "COMPLETED"
    assert result["findings"][-1]["rule_id"] == "TEST-01"
    assert result["disposition"] == "NEEDS_INFORMATION"


def test_module_error_never_passes():
    registry, workflow = default_registry(), foundation_workflow()
    def broken(*args):
        raise RuntimeError("secret details must not appear in trace")
    registry.register(Module(Manifest(id="test.broken", version="1", rule_ids=["TEST-02"]), broken))
    workflow.steps.append(Step(id="broken", module="test.broken", module_version="1"))
    result = execute(registry, workflow, context(), FactSet(facts=[]))
    assert result["status"] == "PROCESSING_FAILED"
    assert result["disposition"] is None
    assert result["trace"][-1]["error_code"] == "MODULE_EXECUTION_FAILED"
    assert "secret" not in str(result)


def test_module_permissions_enforced():
    ctx = context().model_copy(update={"permissions": frozenset()})
    result = execute(default_registry(), foundation_workflow(), ctx, FactSet(facts=[]))
    assert result["status"] == "PROCESSING_FAILED"
    assert all(t["error_code"] == "MODULE_PERMISSION_DENIED" for t in result["trace"])
