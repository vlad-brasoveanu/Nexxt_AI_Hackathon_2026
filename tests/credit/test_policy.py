"""The deterministic credit policy engine on the demo scenario numbers (Codeforge Digital) and its edge cases."""
from datetime import date
from pathlib import Path

import pytest

from app.credit import finance
from app.credit.numbers import fmt_ro, parse_ro
from app.credit.policy import Inputs, evaluate, required_level, terms_for
from app.credit.sources import Sources

SOURCES = Sources(Path(__file__).resolve().parents[2] / "fixtures")
STANDARDS = SOURCES.standards(date(2026, 10, 28))
MARKET = {"index": "ROBOR3M", "value_pct": 5.80, "as_of": "2026-10-27", "source": "test"}


def codeforge(**changes):
    base = dict(amount=3_900_000, term_months=60, product="Credit de investiții IMM", purpose="Sediu", secured=True, cfads=1_372_000,
                ebitda=1_585_000, net_debt=350_000, revenue=7_900_000, revenue_previous=6_300_000, years_in_business=4.97,
                existing_service=288_000, bureau_max_dpd=0, collateral_value=5_200_000, group_exposure=800_000,
                turnover_gap_pct=-2.3, concentration_pct=38.0, top_client="Hanse Logistik GmbH")
    return Inputs(**{**base, **changes})


def test_romanian_numbers_round_trip():
    assert parse_ro("7.900.000") == 7_900_000 and parse_ro("(151.200)") == -151_200 and parse_ro("244466,67") == 244_466.67
    assert parse_ro("rd. 01") is None and fmt_ro(3_440_000) == "3.440.000" and fmt_ro(1.2026, 2) == "1,20"


def test_annuity_and_capacity():
    payment = finance.monthly_payment(3_440_000, 8.8, 60)
    assert payment == pytest.approx(71_075, abs=2)
    assert finance.dscr(1_372_000, 288_000, 3_440_000, 8.8, 60) == pytest.approx(1.2026, abs=1e-3)
    assert finance.max_amount_for_dscr(1_372_000, 288_000, 1.2, 8.8, 60) == pytest.approx(3_449_700, rel=1e-3)


def test_codeforge_counter_offer_limited_by_dscr_at_l2():
    r = evaluate(STANDARDS, MARKET, codeforge())
    assert r["decision"] == "COUNTER_OFFER" and r["level"] == "L2"
    p = r["proposed"]
    assert p["amount"] == 3_440_000 and p["rate_pct"] == 8.8 and p["ltv_pct"] == pytest.approx(66.2, abs=0.1)
    assert p["dscr"] >= 1.20 and p["dscr_stressed"] >= 1.0
    failed = {x["rule_id"] for x in r["rules"] if x["outcome"] == "FAIL"}
    assert failed == {"CR-01", "CR-06"}
    assert any("concentrării" in c for c in r["conditions"])


def test_higher_reference_rate_lowers_the_offer():
    assert evaluate(STANDARDS, {**MARKET, "value_pct": 6.05}, codeforge())["proposed"]["amount"] == 3_420_000


def test_missing_documents_mean_no_recommendation():
    r = evaluate(STANDARDS, MARKET, codeforge(missing=["Situații financiare 2024"]))
    assert r["decision"] == "NEEDS_INFORMATION" and r["proposed"] is None


def test_knockouts_decline_at_l1():
    for changes, code in [(dict(bureau_max_dpd=95), "R-BUREAU-90D"), (dict(sanctions_hits=1), "R-SANCTIONS"),
                          (dict(years_in_business=1.2), "R-SENIORITY")]:
        r = evaluate(STANDARDS, MARKET, codeforge(**changes))
        assert r["decision"] == "DECLINE" and r["level"] == "L1" and r["reasons"][0]["code"] == code


def test_small_request_passes_and_is_signed_at_l1():
    r = evaluate(STANDARDS, MARKET, codeforge(amount=300_000, secured=False, collateral_value=None, group_exposure=0))
    assert r["decision"] in {"APPROVE", "APPROVE_WITH_CONDITIONS"} and r["level"] == "L1"


def test_overrides_escalate_to_committee():
    rec = evaluate(STANDARDS, MARKET, codeforge())
    full = terms_for(STANDARDS, MARKET, codeforge(), 3_900_000, 60)
    assert required_level(STANDARDS, rec, "MODIFY", full, 800_000)[:2] == ("L3", True)
    offer = terms_for(STANDARDS, MARKET, codeforge(), 3_440_000, 60)
    assert required_level(STANDARDS, rec, "APPROVE", offer, 800_000)[:2] == ("L2", False)
    assert required_level(STANDARDS, rec, "REJECT", None, 800_000)[:2] == ("L1", True)
    decline = evaluate(STANDARDS, MARKET, codeforge(bureau_max_dpd=95))
    assert required_level(STANDARDS, decline, "APPROVE", full, 800_000)[0] == "L3"
