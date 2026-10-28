"""Specialist agents. Each one reads the shared board and the case documents, publishes evidence-bound facts, metrics
and issues, and returns a Report for the timeline. Language models are used only where they add value, on the
smallest model that does the job; every value they propose is verified against the source text."""
from app.agents.specialists import analyst, cashflow, completeness, critic, financials, kyb, memo, policy

RUNNERS = {
    "completeness.check": completeness.check,
    "financials.analyze": financials.analyze,
    "cashflow.analyze": cashflow.analyze,
    "kyb.investigate": kyb.investigate,
    "analyst.synthesize": analyst.synthesize,
    "policy.evaluate": policy.evaluate,
    "memo.draft": memo.draft,
    "critic.review": critic.review,
}
