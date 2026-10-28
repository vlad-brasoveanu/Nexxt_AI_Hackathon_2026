"""Loan arithmetic used by the policy engine and the what-if endpoint. Pure functions, no I/O."""
from math import floor


def monthly_payment(amount: float, annual_rate_pct: float, months: int) -> float:
    """Level monthly instalment (annuity) for a fully amortising loan."""
    if amount <= 0:
        return 0.0
    rate = annual_rate_pct / 100 / 12
    if rate == 0:
        return amount / months
    growth = (1 + rate) ** months
    return amount * rate * growth / (growth - 1)


def annual_service(amount: float, annual_rate_pct: float, months: int) -> float:
    return 12 * monthly_payment(amount, annual_rate_pct, months)


def dscr(cfads: float, existing_service: float, amount: float, annual_rate_pct: float, months: int) -> float:
    """Cash flow available for debt service over total annual debt service (existing + new loan)."""
    service = existing_service + annual_service(amount, annual_rate_pct, months)
    return cfads / service if service else float("inf")


def max_amount_for_dscr(cfads: float, existing_service: float, dscr_min: float, annual_rate_pct: float, months: int) -> float:
    """Largest amount whose DSCR stays at or above the minimum (0 when existing debt already uses the capacity)."""
    room = cfads / dscr_min - existing_service
    factor = annual_service(1.0, annual_rate_pct, months)
    return max(0.0, room / factor) if factor else 0.0


def floor_to(value: float, step: int) -> int:
    return int(floor(value / step) * step) if step else int(value)


def ltv_pct(amount: float, collateral_value: float | None) -> float | None:
    return amount / collateral_value * 100 if collateral_value else None
