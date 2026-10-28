from app.core.contracts import Step, Workflow
from app.engine.registry import Registry
from app.modules import ALL_MODULES


def default_registry():
    registry = Registry()
    for module in ALL_MODULES:
        registry.register(module)
    return registry


def foundation_workflow():
    return Workflow(id="ro.sme.foundation", version="0.1.0", steps=[
        Step(id="validity", module="kyc.validity", module_version="0.1.0"),
        Step(id="consistency", module="kyc.consistency", module_version="0.1.0"),
        Step(id="freshness", module="kyc.freshness", module_version="0.1.0"),
    ])
