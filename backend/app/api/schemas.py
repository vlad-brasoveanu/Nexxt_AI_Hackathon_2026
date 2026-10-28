from datetime import date

from pydantic import Field

from app.core.contracts import Contract, FactSet


class Login(Contract):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class NewCase(Contract):
    title: str = Field(min_length=1, max_length=200)


class ImportFacts(Contract):
    expected_revision: int = Field(ge=0)
    facts: FactSet


class RunRequest(Contract):
    expected_revision: int = Field(ge=0)
    evaluation_date: date
