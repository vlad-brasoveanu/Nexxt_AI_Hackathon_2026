from dataclasses import dataclass
from typing import Callable
from app.core.contracts import Context, FactSet, FindingSet, Manifest, Policy, Workflow


@dataclass(frozen=True)
class Module:
    manifest: Manifest
    execute: Callable[[Context, FactSet, Policy], FindingSet]


class Registry:
    def __init__(self):
        self._modules: dict[tuple[str, str], Module] = {}

    def register(self, module: Module):
        key = (module.manifest.id, module.manifest.version)
        if key in self._modules:
            raise ValueError("Duplicate module version")
        self._modules[key] = module

    def get(self, name: str, version: str) -> Module:
        try:
            return self._modules[(name, version)]
        except KeyError as exc:
            raise ValueError("Unregistered module version") from exc

    def catalogue(self):
        return [m.manifest.model_dump() for m in self._modules.values()]

    def validate(self, workflow: Workflow):
        if not workflow.steps:
            raise ValueError("Empty workflow")
        steps = {s.id: s for s in workflow.steps}
        if len(steps) != len(workflow.steps):
            raise ValueError("Duplicate step ID")
        for step in workflow.steps:
            manifest = self.get(step.module, step.module_version).manifest
            if (step.input_schema, step.output_schema) != (manifest.input_schema, manifest.output_schema):
                raise ValueError("Incompatible step schema")
            if any(dep not in steps for dep in step.depends_on):
                raise ValueError("Missing dependency")
        ordered, visiting, visited = [], set(), set()

        def visit(key):
            if key in visiting:
                raise ValueError("Cyclic workflow")
            if key in visited:
                return
            visiting.add(key)
            for dep in steps[key].depends_on:
                visit(dep)
            visiting.remove(key)
            visited.add(key)
            ordered.append(steps[key])

        for key in steps:
            visit(key)
        return ordered
