"""Descriptive statistics over a SYNTHETIC past-cases dataset, to give the human analyst context.

Three read-only views of `fixtures/credit/history/past_cases.csv` (600 generated SME credit cases, 2019-2024):
sector benchmarks (quartiles and percentile of one applicant metric), precedents (the closest past cases) and the
outcome of the applicant's neighbourhood (approval share and default rate with a Wilson interval).

This is NOT a scoring model and never an input to the deterministic credit decision: nothing here approves,
declines, prices or limits a request, and the dataset does not describe real clients. Pure functions over
immutable data, standard library only; the file is parsed once per path and cached.
"""
import csv
import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from statistics import fmean, pstdev

SYNTHETIC_NOTE = "Bază de date istorică sintetică (generată), nu reflectă cazuri reale."
DEFAULT_PATH = Path(__file__).resolve().parents[3] / "fixtures" / "credit" / "history" / "past_cases.csv"

SECTOR_LABELS = {
    "J": "IT & comunicații",
    "C": "Industrie prelucrătoare",
    "G": "Comerț",
    "H": "Transport și depozitare",
    "F": "Construcții",
    "A": "Agricultură",
    "I": "HoReCa",
    "M": "Servicii profesionale",
}
ALL_SECTORS = "ALL"   # `sector` of a benchmark computed over the whole portfolio (too few cases in the requested sector)
MIN_BENCHMARK_CASES = 20
Z95 = 1.96

# CAEN division ranges (first two digits) -> section letter; anything else is "X".
_DIVISIONS = ((1, 3, "A"), (10, 33, "C"), (41, 43, "F"), (45, 47, "G"), (49, 53, "H"), (55, 56, "I"), (58, 63, "J"), (69, 75, "M"))

# Benchmarked metrics: key, Romanian label, which direction is favourable.
_METRICS = (
    ("dscr", "DSCR", "higher"),
    ("ebitda_margin_pct", "Marjă EBITDA", "higher"),
    ("net_debt_ebitda", "Datorie netă / EBITDA", "lower"),
    ("current_ratio", "Lichiditate curentă", "higher"),
    ("client_concentration_pct", "Concentrare client principal", "lower"),
)
# Applicant keys that define "similar"; revenue is compared on a log10 scale.
_SIMILARITY_KEYS = ("dscr", "net_debt_ebitda", "ebitda_margin_pct", "revenue_ron", "years_in_business", "client_concentration_pct")


@dataclass(frozen=True)
class PastCase:
    """One synthetic past case. `outcome_24m` is None for declined cases and `ltv_pct` for unsecured requests."""
    id: str
    year: int
    sector: str
    sector_label: str
    caen: str
    county: str
    years_in_business: float
    revenue_ron: int
    ebitda_margin_pct: float
    net_debt_ebitda: float
    dscr: float
    current_ratio: float
    client_concentration_pct: float
    bureau_max_dpd: int
    ltv_pct: float | None
    amount_ron: int
    term_months: int
    decision: str
    outcome_24m: str | None


def _parse(row: Mapping[str, str]) -> PastCase:
    return PastCase(
        id=row["id"], year=int(row["year"]), sector=row["sector"], sector_label=row["sector_label"], caen=row["caen"],
        county=row["county"], years_in_business=float(row["years_in_business"]), revenue_ron=int(row["revenue_ron"]),
        ebitda_margin_pct=float(row["ebitda_margin_pct"]), net_debt_ebitda=float(row["net_debt_ebitda"]), dscr=float(row["dscr"]),
        current_ratio=float(row["current_ratio"]), client_concentration_pct=float(row["client_concentration_pct"]),
        bureau_max_dpd=int(row["bureau_max_dpd"]), ltv_pct=float(row["ltv_pct"]) if row["ltv_pct"] else None,
        amount_ron=int(row["amount_ron"]), term_months=int(row["term_months"]), decision=row["decision"],
        outcome_24m=row["outcome_24m"] or None)


@lru_cache(maxsize=8)
def _read(path: str) -> tuple[PastCase, ...]:
    with open(path, encoding="utf-8", newline="") as handle:
        return tuple(_parse(row) for row in csv.DictReader(handle))


def load(path: str | Path | None = None) -> tuple[PastCase, ...]:
    """All past cases in file order; each file is parsed once per process (cache keyed by the path string)."""
    return _read(str(DEFAULT_PATH if path is None else path))


def sector_for_caen(caen: str) -> str:
    """Section letter of a CAEN class code ("6201" -> "J"); "X" for divisions the dataset does not cover."""
    digits = f"{caen:04d}" if isinstance(caen, int) else "".join(ch for ch in str(caen) if ch.isascii() and ch.isdigit())
    if len(digits) < 2:
        return "X"
    division = int(digits[:2])
    return next((letter for low, high, letter in _DIVISIONS if low <= division <= high), "X")


def _number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _sector(value: str) -> str:
    text = str(value or "").strip().upper()
    return sector_for_caen(text) if text[:1].isdigit() else text   # a CAEN code is accepted in place of the letter


def _pool(sector: str, minimum: int, cases: Iterable[PastCase] | None) -> tuple[str, tuple[PastCase, ...]]:
    """(scope, cases): the same-sector cases, or the whole portfolio (scope ALL_SECTORS) when there are fewer than `minimum`."""
    everything = load() if cases is None else tuple(cases)
    same = tuple(case for case in everything if case.sector == sector)
    return (sector, same) if len(same) >= minimum else (ALL_SECTORS, everything)


def _quantile(ordered: list[float], q: float) -> float:
    """Linear interpolation between closest ranks on an ascending list."""
    position = (len(ordered) - 1) * q
    low = math.floor(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (position - low) * (ordered[high] - ordered[low])


def benchmarks(sector: str, applicant: Mapping[str, float], cases: Iterable[PastCase] | None = None) -> list[dict]:
    """Where each applicant metric sits among the sector's past cases.

    One dict per metric present in `applicant` (dscr, ebitda_margin_pct, net_debt_ebitda, current_ratio,
    client_concentration_pct, in that order): quartiles of the sector (rounded to 2 decimals), the applicant's value,
    its percentile (0-100: share of past cases with a value <= the applicant's) and which direction is favourable
    ("higher" or "lower"). The sector is the dataset's own when it has at least 20 cases; otherwise the whole portfolio
    is used and `sector` reads "ALL". The percentile is not flipped for "lower"-is-better metrics.
    """
    scope, pool = _pool(_sector(sector), MIN_BENCHMARK_CASES, cases)
    rows = []
    for key, label, better in _METRICS:
        value = _number(applicant.get(key))
        if value is None or not pool:
            continue
        ordered = sorted(getattr(case, key) for case in pool)
        rows.append({
            "metric": key, "label": label, "sector": scope,
            "p25": round(_quantile(ordered, 0.25), 2), "median": round(_quantile(ordered, 0.5), 2),
            "p75": round(_quantile(ordered, 0.75), 2), "value": value,
            "percentile": int(100 * sum(x <= value for x in ordered) / len(ordered) + 0.5), "better": better})
    return rows


def _nearest(sector: str, applicant: Mapping[str, float], k: int, cases: Iterable[PastCase] | None) -> list[tuple[float, PastCase]]:
    """The k closest cases as (distance, case), nearest first, ties by id.

    Distance is Euclidean over the similarity keys the applicant provides, each standardised (z-score) over the
    candidate pool: the sector's cases, or all cases when the sector has fewer than k. Nothing is returned when the
    applicant offers no comparable key.
    """
    wanted = {}
    for key in _SIMILARITY_KEYS:
        value = _number(applicant.get(key))
        if value is not None and (key != "revenue_ron" or value > 0):
            wanted[key] = math.log10(value) if key == "revenue_ron" else value
    _, pool = _pool(sector, k, cases)
    if k <= 0 or not wanted or not pool:
        return []
    scales = {}
    columns = {}
    for key in wanted:
        columns[key] = [math.log10(c.revenue_ron) if key == "revenue_ron" else getattr(c, key) for c in pool]
        scales[key] = pstdev(columns[key])   # a constant column carries no information and is skipped below
    ranked = []
    for index, case in enumerate(pool):
        squares = sum(((wanted[key] - columns[key][index]) / scales[key]) ** 2 for key in wanted if scales[key] > 0)
        ranked.append((math.sqrt(squares), case))
    ranked.sort(key=lambda item: (item[0], item[1].id))
    return ranked[:k]


def precedents(sector: str, applicant: Mapping[str, float], k: int = 5, cases: Iterable[PastCase] | None = None) -> list[dict]:
    """The k most similar past cases (same sector; all cases if the sector has fewer than k), most similar first.

    `similarity` is 1 / (1 + standardised distance) rounded to 2 decimals; equal similarities are ordered by id.
    """
    rows = [{"id": case.id, "sector": case.sector, "year": case.year, "amount": case.amount_ron, "dscr": case.dscr,
             "net_debt_ebitda": case.net_debt_ebitda, "decision": case.decision, "outcome_24m": case.outcome_24m,
             "similarity": round(1 / (1 + distance), 2)} for distance, case in _nearest(_sector(sector), applicant, k, cases)]
    rows.sort(key=lambda row: (-row["similarity"], row["id"]))
    return rows


def _percent(part: int, whole: int) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def _wilson(successes: int, n: int) -> tuple[float, float]:
    """95% Wilson score interval for a proportion, in percent with one decimal; (0.0, 0.0) when n is 0."""
    if n == 0:
        return 0.0, 0.0
    p = successes / n
    scale = 1 + Z95 ** 2 / n
    centre = (p + Z95 ** 2 / (2 * n)) / scale
    half = Z95 * math.sqrt(p * (1 - p) / n + Z95 ** 2 / (4 * n ** 2)) / scale
    return round(100 * max(0.0, centre - half), 1), round(100 * min(1.0, centre + half), 1)


def neighborhood(sector: str, applicant: Mapping[str, float], k: int = 25, cases: Iterable[PastCase] | None = None) -> dict:
    """What happened to the k nearest past cases (same distance as `precedents`).

    `n` is the number of neighbours used, `approved_pct` the share approved or modified, `default_rate_pct` the share of
    defaults among neighbours that have a 24-month outcome (declined cases have none), with its 95% Wilson interval.
    Zero denominators give 0.0 (and a 0.0-0.0 interval) rather than an error.
    """
    near = [case for _, case in _nearest(_sector(sector), applicant, k, cases)]
    with_outcome = [case for case in near if case.outcome_24m is not None]
    defaults = sum(case.outcome_24m == "default" for case in with_outcome)
    low, high = _wilson(defaults, len(with_outcome))
    return {"n": len(near), "approved_pct": _percent(sum(case.decision in ("APPROVE", "MODIFY") for case in near), len(near)),
            "default_rate_pct": _percent(defaults, len(with_outcome)), "ci_low_pct": low, "ci_high_pct": high}
