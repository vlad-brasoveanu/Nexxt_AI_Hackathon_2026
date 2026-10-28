"""Past-cases history: the synthetic generator, the committed CSV and the descriptive statistics built on it."""
import importlib.util
import sys
from collections import Counter
from pathlib import Path

import pytest

from app.credit import history

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = {"dscr": 1.09, "net_debt_ebitda": 2.68, "ebitda_margin_pct": 20.1, "current_ratio": 1.67, "client_concentration_pct": 38.0}
SECTOR_SHARES = {"J": 0.18, "C": 0.18, "G": 0.20, "H": 0.12, "F": 0.12, "A": 0.08, "I": 0.06, "M": 0.06}


@pytest.fixture(scope="module")
def generator():
    spec = importlib.util.spec_from_file_location("casecheck_demo_history", ROOT / "scripts" / "demo" / "history.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    yield module
    sys.modules.pop(spec.name, None)


def case(number, **overrides):
    fields = dict(id=f"T-{number:04d}", year=2022, sector="J", sector_label="IT & comunicații", caen="6201", county="Cluj",
                  years_in_business=5.0, revenue_ron=1_000_000, ebitda_margin_pct=10.0, net_debt_ebitda=2.0, dscr=1.5,
                  current_ratio=1.5, client_concentration_pct=20.0, bureau_max_dpd=0, ltv_pct=None, amount_ron=100_000,
                  term_months=36, decision="APPROVE", outcome_24m="performing")
    fields.update(overrides)
    return history.PastCase(**fields)


# --- generator and committed fixture ---------------------------------------------------------------------------------

def test_generator_is_deterministic(generator):
    assert generator.generate() == generator.generate()
    assert generator.generate(seed=1)[:5] != generator.generate()[:5]
    assert len(generator.generate(n=50)) == 50


def test_committed_csv_is_the_generator_output(generator):
    if sys.version_info[:2] != (3, 12):
        pytest.skip("the fixture was generated with CPython 3.12; other versions may draw different random streams")
    with open(history.DEFAULT_PATH, encoding="utf-8", newline="") as handle:
        committed = handle.read()
    assert committed == generator.render_csv(generator.generate()), "regenerate with: .venv/bin/python scripts/demo/history.py"


def test_generator_main_writes_a_csv_and_a_summary(generator, tmp_path, capsys):
    target = tmp_path / "small.csv"
    generator.main(["--count", "60", "--output", str(target)])
    assert len(history.load(target)) == 60
    assert "SINTETICE" in capsys.readouterr().out


def test_csv_loads_600_synthetic_cases():
    cases = history.load()
    assert len(cases) == 600
    assert [c.id for c in cases] == [f"H-{n:04d}" for n in range(1, 601)]
    assert [c.year for c in cases] == sorted(c.year for c in cases)
    assert {c.year for c in cases} == set(range(2019, 2025))
    assert "sintetică" in history.SYNTHETIC_NOTE
    assert history.DEFAULT_PATH == ROOT / "fixtures" / "credit" / "history" / "past_cases.csv"


def test_sectors_follow_the_agreed_weights_and_caen_mapping():
    cases = history.load()
    counts = Counter(c.sector for c in cases)
    assert set(counts) == set(history.SECTOR_LABELS) == set(SECTOR_SHARES)
    for letter, share in SECTOR_SHARES.items():
        assert abs(counts[letter] - 600 * share) <= 1
    assert all(history.SECTOR_LABELS[c.sector] == c.sector_label for c in cases)
    assert all(history.sector_for_caen(c.caen) == c.sector for c in cases)
    assert all(len(c.caen) == 4 and c.caen.isdigit() for c in cases)


def test_fields_are_typed_rounded_and_plausible():
    cases = history.load()
    assert all(0.1 < c.dscr < 8 and 0.1 < c.net_debt_ebitda < 15 and 0.3 < c.current_ratio < 6 for c in cases)
    assert all(1.0 <= c.years_in_business <= 45 and 0 < c.client_concentration_pct < 100 for c in cases)
    assert all(c.revenue_ron >= 1_000_000 and c.ebitda_margin_pct > 0 and c.bureau_max_dpd >= 0 for c in cases)
    assert all(c.amount_ron >= 50_000 and c.amount_ron % 10_000 == 0 for c in cases)
    assert all(c.term_months in (12, 24, 36, 48, 60, 84, 120) for c in cases)
    assert all(c.ltv_pct is None or 0 < c.ltv_pct < 100 for c in cases)
    assert all(round(c.dscr, 2) == c.dscr and round(c.ebitda_margin_pct, 1) == c.ebitda_margin_pct for c in cases)
    # DSCR is mostly 0.8-3.0 with a tail on both sides.
    inside = sum(0.8 <= c.dscr <= 3.0 for c in cases) / len(cases)
    assert 0.8 <= inside < 1.0


def test_decision_mix_is_plausible():
    cases = history.load()
    share = {d: sum(c.decision == d for c in cases) / len(cases) for d in ("APPROVE", "MODIFY", "DECLINE")}
    assert sum(share.values()) == pytest.approx(1.0)
    assert 0.55 <= share["APPROVE"] <= 0.70
    assert 0.15 <= share["MODIFY"] <= 0.25
    assert 0.12 <= share["DECLINE"] <= 0.24


def test_decisions_follow_the_policy_thresholds():
    cases = history.load()
    hard = [c for c in cases if c.dscr < 1.0 or c.bureau_max_dpd >= 90 or c.net_debt_ebitda > 5]
    clean = [c for c in cases if c.dscr >= 1.25 and c.bureau_max_dpd <= 30 and c.net_debt_ebitda <= 3.5 and (c.ltv_pct or 0) <= 70
             and c.years_in_business >= 2 and c.client_concentration_pct <= 55]
    assert len(hard) > 50 and sum(c.decision == "DECLINE" for c in hard) / len(hard) >= 0.8
    assert len(clean) > 200 and sum(c.decision == "APPROVE" for c in clean) / len(clean) >= 0.85
    borderline = [c for c in cases if 1.0 <= c.dscr < 1.25 and c.bureau_max_dpd < 90 and c.net_debt_ebitda <= 5]
    assert sum(c.decision == "MODIFY" for c in borderline) / len(borderline) >= 0.6


def test_outcomes_exist_only_for_funded_cases_and_are_calibrated():
    cases = history.load()
    assert all((c.outcome_24m is None) == (c.decision == "DECLINE") for c in cases)
    funded = [c for c in cases if c.decision != "DECLINE"]
    assert {c.outcome_24m for c in funded} == {"performing", "late", "default"}
    default_rate = sum(c.outcome_24m == "default" for c in funded) / len(funded)
    late_rate = sum(c.outcome_24m == "late" for c in funded) / len(funded)
    assert 0.02 <= default_rate <= 0.07
    assert 0.05 <= late_rate <= 0.10


def test_weaker_cases_default_more_often():
    funded = [c for c in history.load() if c.decision != "DECLINE"]
    weak = [c for c in funded if c.dscr < 1.4 or c.net_debt_ebitda > 2.5]
    strong = [c for c in funded if c.dscr >= 1.4 and c.net_debt_ebitda <= 2.5]
    rate = lambda group: sum(c.outcome_24m == "default" for c in group) / len(group)
    assert rate(weak) > rate(strong)


# --- sector_for_caen -------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("caen,letter", [
    ("6201", "J"), ("4941", "H"), ("1610", "C"), ("0111", "A"), ("4120", "F"), ("4711", "G"), ("5520", "I"), ("7022", "M"),
    ("0399", "A"), ("0400", "X"), ("0510", "X"), ("1000", "C"), ("3399", "C"), ("3511", "X"), ("4100", "F"), ("4399", "F"),
    ("4400", "X"), ("4500", "G"), ("4799", "G"), ("4800", "X"), ("4900", "H"), ("5399", "H"), ("5400", "X"), ("5500", "I"),
    ("5699", "I"), ("5700", "X"), ("5800", "J"), ("6399", "J"), ("6419", "X"), ("6810", "X"), ("6900", "M"), ("7599", "M"),
    ("7600", "X"), ("8623", "X"), ("62.01", "J"), (" 6201 ", "J"), (111, "A"), ("", "X"), ("6", "X"), ("abcd", "X"),
])
def test_sector_for_caen(caen, letter):
    assert history.sector_for_caen(caen) == letter


# --- benchmarks ------------------------------------------------------------------------------------------------------

def test_benchmarks_for_the_sample_applicant():
    result = history.benchmarks("J", SAMPLE)
    assert [b["metric"] for b in result] == ["dscr", "ebitda_margin_pct", "net_debt_ebitda", "current_ratio", "client_concentration_pct"]
    assert [b["label"] for b in result] == ["DSCR", "Marjă EBITDA", "Datorie netă / EBITDA", "Lichiditate curentă", "Concentrare client principal"]
    assert [b["better"] for b in result] == ["higher", "higher", "lower", "higher", "lower"]
    for row in result:
        assert list(row) == ["metric", "label", "sector", "p25", "median", "p75", "value", "percentile", "better"]
        assert row["sector"] == "J"
        assert row["p25"] <= row["median"] <= row["p75"]
        assert 0 <= row["percentile"] <= 100 and isinstance(row["percentile"], int)
        assert row["value"] == SAMPLE[row["metric"]]
    by_metric = {b["metric"]: b for b in result}
    # The demo story: thin cash-flow cover and heavy leverage for an IT company.
    assert by_metric["dscr"]["percentile"] <= 20 and by_metric["dscr"]["median"] > 1.5
    assert by_metric["net_debt_ebitda"]["percentile"] >= 80


def test_quantiles_percentile_and_rounding_on_known_data():
    cases = [case(i, dscr=float(i)) for i in range(22)]   # 0 .. 21
    row = history.benchmarks("J", {"dscr": 10.0}, cases)[0]
    assert (row["p25"], row["median"], row["p75"]) == (5.25, 10.5, 15.75)   # linear interpolation between ranks
    assert row["percentile"] == 50                                            # 11 of 22 values are <= 10
    assert history.benchmarks("J", {"dscr": -1.0}, cases)[0]["percentile"] == 0
    assert history.benchmarks("J", {"dscr": 21.0}, cases)[0]["percentile"] == 100
    assert history.benchmarks("J", {"dscr": 21.5}, cases)[0]["percentile"] == 100
    thirds = [case(i, dscr=x) for i, x in enumerate([1.0, 1.0, 2.0] * 8)]
    assert history.benchmarks("J", {"dscr": 1.0}, thirds)[0]["percentile"] == 67   # 16 of 24 values are <= 1.0
    assert history.benchmarks("J", {"dscr": 1.0}, thirds)[0]["median"] == 1.0
    odd = [case(i, dscr=x) for i, x in enumerate([0.111] * 10 + [0.222] * 10 + [0.333])]
    assert history.benchmarks("J", {"dscr": 0.2}, odd)[0]["p25"] == 0.11   # rounded to 2 decimals


def test_benchmarks_use_the_sector_when_it_has_enough_cases_else_the_portfolio():
    cases = [case(i, dscr=1.0 + i / 100) for i in range(25)] + [case(100 + i, sector="G", dscr=3.0 + i / 100) for i in range(10)]
    same = history.benchmarks("J", {"dscr": 1.2}, cases)[0]
    assert same["sector"] == "J" and same["median"] == 1.12
    fallback = history.benchmarks("G", {"dscr": 1.2}, cases)[0]
    assert fallback["sector"] == history.ALL_SECTORS == "ALL"
    assert fallback["median"] == pytest.approx(1.17)   # all 35 cases, not the 10 trade cases
    assert history.benchmarks("X", {"dscr": 1.2})[0]["sector"] == "ALL"
    assert history.benchmarks("g", {"dscr": 1.2})[0]["sector"] == "G"       # letters are case-insensitive
    assert history.benchmarks("6201", {"dscr": 1.2})[0]["sector"] == "J"   # a CAEN code resolves to its section


def test_benchmarks_skip_metrics_that_are_missing_or_not_numbers():
    result = history.benchmarks("J", {"dscr": 1.2, "current_ratio": None, "net_debt_ebitda": "n/a", "ebitda_margin_pct": float("nan"), "other": 3})
    assert [b["metric"] for b in result] == ["dscr"]
    assert history.benchmarks("J", {}) == []
    assert history.benchmarks("J", {"dscr": 1.2}, []) == []


# --- precedents and neighborhood ---------------------------------------------------------------------------------------

def test_precedents_are_same_sector_and_sorted_by_similarity():
    result = history.precedents("J", SAMPLE)
    assert len(result) == 5
    assert {p["sector"] for p in result} == {"J"}
    similarities = [p["similarity"] for p in result]
    assert similarities == sorted(similarities, reverse=True)
    assert all(0 < s <= 1 for s in similarities)
    assert len({p["id"] for p in result}) == 5
    assert set(result[0]) == {"id", "sector", "year", "amount", "dscr", "net_debt_ebitda", "decision", "outcome_24m", "similarity"}
    by_id = {c.id: c for c in history.load()}
    for p in result:
        source = by_id[p["id"]]
        assert (p["year"], p["amount"], p["dscr"], p["decision"], p["outcome_24m"]) == (source.year, source.amount_ron, source.dscr, source.decision, source.outcome_24m)


def test_precedents_find_an_identical_case_first_and_respect_k():
    target = next(c for c in history.load() if c.sector == "G")
    applicant = {"dscr": target.dscr, "net_debt_ebitda": target.net_debt_ebitda, "ebitda_margin_pct": target.ebitda_margin_pct,
                 "revenue_ron": target.revenue_ron, "years_in_business": target.years_in_business,
                 "client_concentration_pct": target.client_concentration_pct}
    result = history.precedents("G", applicant, k=8)
    assert len(result) == 8
    assert result[0]["id"] == target.id and result[0]["similarity"] == 1.0
    assert all(p["sector"] == "G" for p in result)
    assert history.precedents("G", applicant, k=0) == []


def test_precedents_rank_by_standardised_distance_and_break_ties_by_id():
    cases = [case(1, dscr=1.00), case(2, dscr=1.10), case(3, dscr=1.30), case(4, dscr=0.90), case(5, dscr=3.00), case(6, dscr=1.10)]
    result = history.precedents("J", {"dscr": 1.0}, k=4, cases=cases)
    # T-0003 (0.3 away) and T-0005 (2.0 away) are out; the three cases 0.1 away show the same similarity, so they go by id.
    assert [p["id"] for p in result] == ["T-0001", "T-0002", "T-0004", "T-0006"]
    assert [p["similarity"] for p in result] == [1.0, 0.88, 0.88, 0.88]


def test_precedents_standardise_each_metric_over_the_candidate_pool():
    # T-0001 and T-0002 are both exactly 0.5 away in raw units (a tie that T-0001 would win on id), but years_in_business barely
    # varies in this pool while dscr varies a lot, so only T-0002 is genuinely close once each metric is divided by its spread.
    cases = [case(1, dscr=2.0, years_in_business=5.5), case(2, dscr=2.5, years_in_business=5.0)]
    spread = [(0.5, 5.0), (0.75, 5.05), (1.0, 5.1), (3.5, 5.0), (3.75, 5.05), (4.0, 5.1)]
    cases += [case(10 + i, dscr=dscr, years_in_business=years) for i, (dscr, years) in enumerate(spread)]
    result = history.precedents("J", {"dscr": 2.0, "years_in_business": 5.0}, k=3, cases=cases)
    assert result[0]["id"] == "T-0002"
    assert "T-0001" not in {p["id"] for p in result}


def test_precedents_compare_revenue_on_a_log_scale():
    # 20 M and 5 M RON are the same factor (2x) away from 10 M RON, so they are equally similar; raw distance would favour 5 M.
    cases = [case(1, revenue_ron=20_000_000), case(2, revenue_ron=5_000_000)]
    cases += [case(10 + i, revenue_ron=1_000_000 * 10 ** (i / 3)) for i in range(10) if i not in (3, 4)]
    result = history.precedents("J", {"revenue_ron": 10_000_000}, k=2, cases=cases)
    assert [p["id"] for p in result] == ["T-0001", "T-0002"]
    assert result[0]["similarity"] == result[1]["similarity"]
    assert history.precedents("J", {"revenue_ron": 0}, k=2, cases=cases) == []   # a log scale needs a positive revenue


def test_precedents_fall_back_to_all_sectors_when_the_sector_is_too_small():
    cases = [case(i, dscr=1.0 + i / 10) for i in range(6)] + [case(10, sector="A", dscr=1.04)]
    result = history.precedents("A", {"dscr": 1.0}, k=3, cases=cases)
    assert len(result) == 3
    assert {p["sector"] for p in result} == {"J", "A"}   # the lone trade case plus its nearest neighbours from elsewhere


def test_precedents_and_neighborhood_need_a_comparable_metric():
    assert history.precedents("J", {}) == []
    assert history.precedents("J", {"unrelated": 1.0, "dscr": None}) == []
    assert history.neighborhood("J", {}) == {"n": 0, "approved_pct": 0.0, "default_rate_pct": 0.0, "ci_low_pct": 0.0, "ci_high_pct": 0.0}


def test_neighborhood_for_the_sample_applicant():
    result = history.neighborhood("J", SAMPLE)
    assert set(result) == {"n", "approved_pct", "default_rate_pct", "ci_low_pct", "ci_high_pct"}
    assert result["n"] == 25
    assert 0 <= result["approved_pct"] <= 100
    assert result["ci_low_pct"] <= result["default_rate_pct"] <= result["ci_high_pct"]
    assert 0 <= result["ci_low_pct"] and result["ci_high_pct"] <= 100


def test_neighborhood_counts_approvals_and_defaults_among_the_nearest():
    near = [case(i, dscr=1.0 + i / 100, decision="APPROVE" if i < 12 else "MODIFY" if i < 16 else "DECLINE",
                 outcome_24m=None if i >= 16 else "default" if i in (1, 5) else "performing") for i in range(20)]
    far = [case(100 + i, dscr=5.0 + i, decision="DECLINE", outcome_24m=None) for i in range(10)]
    result = history.neighborhood("J", {"dscr": 1.0}, k=20, cases=near + far)
    assert result == {"n": 20, "approved_pct": 80.0,        # 12 approved + 4 modified of 20
                      "default_rate_pct": 12.5,             # 2 defaults among the 16 with an outcome
                      "ci_low_pct": 3.5, "ci_high_pct": 36.0}


@pytest.mark.parametrize("defaults,decided,low,high", [(2, 20, 2.8, 30.1), (0, 10, 0.0, 27.8), (10, 10, 72.2, 100.0), (1, 1, 20.7, 100.0)])
def test_wilson_interval_matches_known_values(defaults, decided, low, high):
    cases = [case(i, outcome_24m="default" if i < defaults else "performing") for i in range(decided)]
    result = history.neighborhood("J", {"dscr": 1.5}, k=decided, cases=cases)
    assert (result["ci_low_pct"], result["ci_high_pct"]) == (low, high)
    assert result["ci_low_pct"] <= result["default_rate_pct"] <= result["ci_high_pct"]


def test_neighborhood_handles_zero_denominators():
    declined = [case(i, decision="DECLINE", outcome_24m=None) for i in range(5)]
    assert history.neighborhood("J", {"dscr": 1.5}, k=5, cases=declined) == {
        "n": 5, "approved_pct": 0.0, "default_rate_pct": 0.0, "ci_low_pct": 0.0, "ci_high_pct": 0.0}
    assert history.neighborhood("J", {"dscr": 1.5}, k=5, cases=[])["n"] == 0
    assert history.neighborhood("J", {"dscr": 1.5}, k=0)["n"] == 0


# --- loading ---------------------------------------------------------------------------------------------------------

def test_load_parses_empty_cells_as_none_and_caches_by_path(generator, tmp_path):
    path = tmp_path / "cases.csv"
    path.write_text(generator.render_csv(generator.generate(n=40)), encoding="utf-8", newline="")
    cases = history.load(path)
    assert len(cases) == 40
    assert history.load(path) is cases and history.load(str(path)) is cases
    assert any(c.ltv_pct is None for c in cases) and any(c.ltv_pct is not None for c in cases)
    assert all(c.outcome_24m is None for c in cases if c.decision == "DECLINE")
    assert history.load() is history.load()
    assert any(c.caen.startswith("0") for c in history.load())   # CAEN codes keep their leading zero
