"""Provider-independent inference interface. Swap the adapter (cloud demo, local final product) without touching callers."""
from dataclasses import dataclass
from typing import Protocol


class InferenceError(Exception):
    """The provider could not return a usable completion. Never fall back to another provider silently."""


@dataclass(frozen=True)
class Completion:
    text: str
    provider: str
    model: str
    latency_ms: float


class InferenceProvider(Protocol):
    name: str
    model: str
    mode: str  # "cloud" or "local"; shown to users as the processing mode

    def complete(self, messages: list[dict], *, timeout: float) -> Completion: ...
