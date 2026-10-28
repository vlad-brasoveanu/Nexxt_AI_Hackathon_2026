from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Evidence(Contract):
    document_id: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    page: int = Field(ge=1)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    quote: str = Field(min_length=1, max_length=5000)


class Fact(Contract):
    id: str = Field(min_length=1, max_length=80)
    entity_id: str = Field(min_length=1, max_length=80)
    field: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=1000)
    evidence: Evidence


class FactSet(Contract):
    schema_version: Literal["FactSet.v1"] = "FactSet.v1"
    extraction_mode: Literal["manual_structured"] = "manual_structured"
    facts: list[Fact] = Field(max_length=500)


class Finding(Contract):
    rule_id: str
    module_id: str
    outcome: Literal["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]
    severity: Literal["info", "blocking"]
    explanation: str
    required_action: str
    evidence: list[Evidence] = Field(default_factory=list)
    entity_id: str | None = None


class FindingSet(Contract):
    schema_version: Literal["FindingSet.v1"] = "FindingSet.v1"
    findings: list[Finding]


class Policy(Contract):
    version: Literal["demo.ro.foundation.1"] = "demo.ro.foundation.1"
    max_extract_age_days: int = Field(default=90, ge=1, le=365)


class Context(Contract):
    actor_id: str
    case_id: str
    evaluation_date: date
    permissions: frozenset[str]
    document_kinds: dict[str, str]


class Manifest(Contract):
    id: str
    version: str
    input_schema: Literal["FactSet.v1"] = "FactSet.v1"
    output_schema: Literal["FindingSet.v1"] = "FindingSet.v1"
    permission: str = "case.analyze"
    side_effects: Literal["none"] = "none"
    rule_ids: list[str]


class Step(Contract):
    id: str
    module: str
    module_version: str
    input_schema: str = "FactSet.v1"
    output_schema: str = "FindingSet.v1"
    input_binding: Literal["case.facts"] = "case.facts"
    depends_on: list[str] = Field(default_factory=list)


class Workflow(Contract):
    id: str
    version: str
    policy: Policy = Field(default_factory=Policy)
    steps: list[Step]
