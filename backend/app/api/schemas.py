from datetime import date
from typing import Literal

from pydantic import Field

from app.core.contracts import Contract, FactSet


class Login(Contract):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class CreditRequest(Contract):
    company: str = Field(min_length=1, max_length=200)
    cui: str = Field(pattern=r"^\d{2,10}$")
    caen: str = Field(pattern=r"^\d{4}$")
    caen_text: str = Field(default="", max_length=300)
    founded: str = Field(default="", max_length=10)
    address: str = Field(default="", max_length=300)
    channel: Literal["online", "sucursală"] = "online"
    request_id: str = Field(default="", max_length=40)
    received_at: str = Field(default="", max_length=40)
    product: str = Field(min_length=1, max_length=120)
    amount: int = Field(gt=0, le=100_000_000)
    term_months: int = Field(ge=12, le=120)
    purpose: str = Field(min_length=1, max_length=500)
    collateral: list[str] = Field(default_factory=list, max_length=10)
    secured: bool = False
    fixture: str | None = Field(default=None, pattern=r"^[a-z0-9-]{1,60}$")  # demo: simulated client-portal answers


class NewCase(Contract):
    title: str = Field(min_length=1, max_length=200)
    kind: Literal["kyc", "credit"] = "kyc"
    credit: CreditRequest | None = None


class ReviewDecision(Contract):
    fact_id: str = Field(min_length=1, max_length=120)
    action: Literal["accept", "reject", "correct"]
    value: str | None = Field(default=None, max_length=40)
    reason: str | None = Field(default=None, min_length=10, max_length=2000)


class ReviewRequest(Contract):
    accept_all_verified: bool = False
    decisions: list[ReviewDecision] = Field(default_factory=list, max_length=500)


class TermsRequest(Contract):
    amount: int = Field(gt=0, le=100_000_000)
    term_months: int = Field(ge=12, le=120)


class DecisionRequest(Contract):
    run_id: str = Field(min_length=1, max_length=36)
    action: Literal["APPROVE", "MODIFY", "REJECT"]
    terms: TermsRequest | None = None
    conditions: list[str] | None = Field(default=None, max_length=20)
    reason: str | None = Field(default=None, max_length=2000)
    human_seconds: float | None = Field(default=None, ge=0, le=86_400)
    demo_exception: bool = False


class MarketPublish(Contract):
    value_pct: float = Field(gt=0, le=30)
    as_of: date | None = None


class ImportFacts(Contract):
    expected_revision: int = Field(ge=0)
    facts: FactSet


class RunRequest(Contract):
    expected_revision: int = Field(ge=0)
    evaluation_date: date
