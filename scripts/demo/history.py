"""Deterministic generator for the SYNTHETIC past-cases history (fixtures/credit/history/past_cases.csv).

600 fictional Romanian SME credit cases "decided" in 2019-2024. No row describes a real company, client, bank or
portfolio: every value is drawn from the sector profiles below with `random.Random(2026)`, and the file only exists
to give the analyst descriptive context (sector benchmarks, similar precedents). It is not a scoring model.

    .venv/bin/python scripts/demo/history.py                   # rewrite the CSV and print a summary
    .venv/bin/python scripts/demo/history.py --count 1000 --output /tmp/other.csv

How a case is built (so the columns stay mutually consistent):
  * revenue and EBITDA margin come from the sector profile; EBITDA = revenue x margin.
  * the request is sized by its annual debt service as a multiple of EBITDA, so `net_debt_ebitda` is the pro-forma
    ratio (existing net debt + the new loan) and `dscr` divides cash flow by existing + new debt service.
  * the decision follows the credit-policy thresholds with noise (hard failures mostly declined, borderline cases
    mostly modified), calibrated to a 62% / 20% / 18% approve / modify / decline mix.
  * the 24-month outcome of every non-declined case comes from a logistic risk model (DSCR, leverage, bureau days past
    due, client concentration, age) calibrated to ~4% defaults and ~7.5% late payers.
  * calibrated draws are systematic, so the committed file lands on those targets within one case, whatever the seed.
"""
import argparse
import csv
import io
import math
import random
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "fixtures" / "credit" / "history" / "past_cases.csv"
SEED = 2026
COUNT = 600

COLUMNS = ("id", "year", "sector", "sector_label", "caen", "county", "years_in_business", "revenue_ron",
           "ebitda_margin_pct", "net_debt_ebitda", "dscr", "current_ratio", "client_concentration_pct",
           "bureau_max_dpd", "ltv_pct", "amount_ron", "term_months", "decision", "outcome_24m")
DECIMALS = {"years_in_business": 1, "ebitda_margin_pct": 1, "net_debt_ebitda": 2, "dscr": 2, "current_ratio": 2,
            "client_concentration_pct": 1, "ltv_pct": 1}

YEARS = (2019, 2020, 2021, 2022, 2023, 2024)
YEAR_WEIGHTS = (12, 13, 17, 18, 20, 20)
ROBOR_PCT = {2019: 3.1, 2020: 2.7, 2021: 2.6, 2022: 5.6, 2023: 6.4, 2024: 5.9}   # indicative yearly averages
VINTAGE_RISK = {2019: 0.0, 2020: 0.3, 2021: 0.0, 2022: 0.15, 2023: 0.25, 2024: 0.0}   # logit shift of the 24m risk

TERMS = (12, 24, 36, 48, 60, 84, 120)
TARGET_DECLINE = 0.18    # portfolio mix of decisions: 62% approved as asked, 20% modified, 18% declined
TARGET_MODIFY = 0.20
TARGET_DEFAULT = 0.04    # 24-month outcomes of the approved and modified cases
TARGET_LATE = 0.075


@dataclass(frozen=True)
class Sector:
    label: str
    weight: float
    caen: tuple[tuple[str, int], ...]      # (4-digit CAEN class, relative weight)
    margin: tuple[float, float]            # EBITDA margin %: mean, standard deviation
    revenue_m: float                       # median annual revenue, million RON
    leverage: float                        # mean existing net debt / EBITDA, before the new loan
    liquidity: float                       # median current ratio
    concentration: float                   # mean share of the largest client, %
    age: float                             # mean years in business
    secured: float                         # share of requests backed by collateral
    terms: tuple[int, ...]                 # relative weights for TERMS
    volatility: float                      # scales the noise of cash-flow conversion
    risk: float                            # logit shift of the 24-month credit risk


SECTORS = {
    "J": Sector("IT & comunicații", 0.18, (("6201", 38), ("6202", 20), ("6311", 12), ("5829", 8), ("6209", 8), ("6312", 6), ("6120", 5), ("6110", 3)),
                (18.0, 5.0), 5.0, 0.9, 1.8, 32, 6.5, 0.35, (2, 18, 30, 20, 20, 6, 4), 0.9, -0.3),
    "C": Sector("Industrie prelucrătoare", 0.18, (("1071", 12), ("1610", 12), ("2511", 14), ("2562", 12), ("2229", 10), ("3109", 9), ("1392", 7), ("2341", 6), ("1013", 8), ("2932", 6), ("1623", 4)),
                (11.0, 4.0), 14.0, 1.2, 1.5, 27, 11.0, 0.75, (2, 6, 14, 18, 26, 18, 16), 1.0, 0.0),
    "G": Sector("Comerț", 0.20, (("4711", 18), ("4690", 12), ("4639", 12), ("4673", 12), ("4511", 10), ("4531", 8), ("4752", 8), ("4651", 6), ("4619", 6), ("4646", 4), ("4721", 4)),
                (6.0, 3.0), 20.0, 1.4, 1.3, 12, 9.0, 0.65, (10, 20, 26, 18, 16, 6, 4), 1.0, 0.1),
    "H": Sector("Transport și depozitare", 0.12, (("4941", 50), ("5210", 12), ("5229", 14), ("4939", 8), ("5320", 10), ("4942", 6)),
                (9.0, 4.0), 8.0, 1.6, 1.15, 26, 8.5, 0.75, (2, 6, 16, 24, 30, 16, 6), 1.2, 0.25),
    "F": Sector("Construcții", 0.12, (("4120", 24), ("4211", 8), ("4221", 6), ("4321", 16), ("4322", 14), ("4391", 8), ("4399", 14), ("4110", 10)),
                (8.0, 4.5), 10.0, 1.4, 1.35, 30, 8.0, 0.60, (6, 18, 28, 20, 16, 8, 4), 1.3, 0.3),
    "A": Sector("Agricultură", 0.08, (("0111", 34), ("0113", 10), ("0141", 10), ("0146", 8), ("0150", 12), ("0121", 6), ("0124", 6), ("0161", 8), ("0210", 6)),
                (15.0, 6.0), 6.0, 1.3, 1.6, 22, 10.0, 0.85, (2, 4, 10, 12, 22, 22, 28), 1.4, 0.0),
    "I": Sector("HoReCa", 0.06, (("5610", 42), ("5520", 18), ("5510", 14), ("5621", 10), ("5630", 10), ("5590", 6)),
                (11.0, 7.0), 3.5, 1.4, 0.95, 6, 7.5, 0.85, (2, 4, 10, 14, 26, 20, 24), 1.8, 0.45),
    "M": Sector("Servicii profesionale", 0.06, (("6910", 12), ("6920", 18), ("7022", 20), ("7111", 12), ("7112", 14), ("7311", 10), ("7120", 6), ("7490", 8)),
                (22.0, 6.0), 2.8, 0.9, 1.9, 28, 8.0, 0.40, (6, 22, 30, 20, 16, 4, 2), 0.9, -0.3),
}

COUNTY_WEIGHTS = {
    "București": 18, "Cluj": 6.5, "Timiș": 6, "Iași": 4.5, "Brașov": 4.5, "Constanța": 4.5, "Prahova": 3.5, "Ilfov": 4,
    "Bihor": 3.2, "Arad": 2.2, "Sibiu": 2.6, "Argeș": 2.6, "Mureș": 2.4, "Dolj": 2.0, "Bacău": 2.0, "Suceava": 2.0,
    "Maramureș": 1.8, "Galați": 1.5, "Hunedoara": 1.4, "Dâmbovița": 1.4, "Alba": 1.4, "Neamț": 1.3, "Buzău": 1.2,
    "Bistrița-Năsăud": 1.2, "Satu Mare": 1.1, "Botoșani": 0.9, "Gorj": 1.0, "Vâlcea": 1.0, "Olt": 0.9, "Brăila": 0.9,
    "Harghita": 1.0, "Covasna": 0.8, "Vaslui": 0.7, "Teleorman": 0.7, "Caraș-Severin": 0.8, "Tulcea": 0.7,
    "Mehedinți": 0.6, "Giurgiu": 0.6, "Călărași": 0.7, "Ialomița": 0.7, "Sălaj": 0.7, "Vrancea": 0.9,
}
COUNTY_BOOST = {
    "J": {"București": 1.8, "Cluj": 1.8, "Timiș": 1.5, "Iași": 1.5, "Brașov": 1.3, "Ilfov": 1.5},
    "M": {"București": 1.8, "Cluj": 1.4, "Timiș": 1.3, "Ilfov": 1.4},
    "C": {"Argeș": 1.8, "Brașov": 1.5, "Timiș": 1.4, "Bihor": 1.5, "Arad": 1.5, "Mureș": 1.5, "Suceava": 1.4, "Prahova": 1.4, "Dâmbovița": 1.5, "Sibiu": 1.4},
    "G": {"Ilfov": 1.4, "București": 1.2, "Prahova": 1.2},
    "H": {"Constanța": 1.8, "Timiș": 1.6, "Arad": 1.7, "Bihor": 1.6, "Ilfov": 2.0, "Prahova": 1.4, "Galați": 1.4, "Dolj": 1.2},
    "F": {"București": 1.3, "Ilfov": 1.8, "Cluj": 1.3, "Constanța": 1.3, "Iași": 1.2},
    "A": {"Ialomița": 4, "Călărași": 4, "Teleorman": 4, "Brăila": 3, "Tulcea": 3, "Olt": 2.5, "Dolj": 2.5, "Constanța": 1.8, "Timiș": 1.5,
          "Buzău": 2, "Vaslui": 2, "Botoșani": 2, "Giurgiu": 3, "Vrancea": 2, "București": 0.1, "Ilfov": 0.5},
    "I": {"Brașov": 2, "Constanța": 2, "Sibiu": 1.8, "Prahova": 1.6, "Maramureș": 1.8, "Suceava": 1.6, "Harghita": 1.6, "Cluj": 1.3, "București": 1.3, "Tulcea": 1.5},
}


def clip(value, low, high):
    return max(low, min(high, value))


def logistic(x):
    return 1 / (1 + math.exp(-x))


def annuity(rate_pct, months):
    """Annual debt service per 1 RON borrowed, for a fully amortising loan with level monthly instalments."""
    i = rate_pct / 1200
    return 12 * i / (1 - (1 + i) ** -months)


def allocate(total, weights):
    """Split `total` into integer counts proportional to `weights` (largest remainder)."""
    raw = [total * w / sum(weights) for w in weights]
    counts = [int(x) for x in raw]
    for index in sorted(range(len(raw)), key=lambda i: raw[i] - counts[i], reverse=True)[: total - sum(counts)]:
        counts[index] += 1
    return counts


def solve(function, target, low=-30.0, high=30.0):
    """Bisection for the intercept at which an increasing `function` reaches `target`."""
    for _ in range(80):
        mid = (low + high) / 2
        low, high = (mid, high) if function(mid) < target else (low, mid)
    return (low + high) / 2


def mean(values):
    values = list(values)
    return sum(values) / len(values)


def truncated(draw, low, high):
    """Redraw until the value falls in [low, high]; unlike clipping this leaves no pile-up of identical values at the bounds."""
    while True:
        value = draw()
        if low <= value <= high:
            return value


def draw_case(rng, letter, year):
    sector = SECTORS[letter]
    weights = [COUNTY_WEIGHTS[name] * COUNTY_BOOST.get(letter, {}).get(name, 1.0) for name in COUNTY_WEIGHTS]
    term = rng.choices(TERMS, sector.terms)[0]
    rate = ROBOR_PCT[year] + rng.uniform(2.4, 4.0)
    while True:   # the request must fit the product: revenue 1-120 M RON, amount 50 k - 12 M RON
        margin = truncated(lambda: rng.gauss(*sector.margin), 2.0, 45.0)
        revenue = int(sector.revenue_m * 1_000_000 * math.exp(rng.gauss(0, 0.85)))
        ebitda = revenue * margin / 100
        # The request is sized by the annual service of the new loan, as a multiple of EBITDA.
        burden = rng.lognormvariate(math.log(0.15), 0.38)
        amount = round(burden / annuity(rate, term) * ebitda / 10_000) * 10_000
        if 1_000_000 <= revenue <= 120_000_000 and 50_000 <= amount <= 12_000_000:
            break
    # Existing net debt (x EBITDA): thinner margins mean more debt, and a few firms are already over-borrowed.
    old_leverage = rng.gammavariate(4.5, sector.leverage / 4.5) * math.exp(-0.15 * (margin - sector.margin[0]) / sector.margin[1])
    if rng.random() < 0.04:
        old_leverage *= rng.uniform(1.7, 3.0)
    new_multiple = amount / ebitda
    service = clip(rng.lognormvariate(math.log(0.235), 0.30), 0.10, 0.45) * old_leverage + new_multiple * annuity(rate, term)
    cash_conversion = clip(rng.gauss(0.72, 0.08 * sector.volatility), 0.45, 0.92)
    dscr = cash_conversion / service
    leverage = clip(old_leverage + new_multiple, 0.05, 15.0)
    liquidity = clip(sector.liquidity * math.exp(rng.gauss(0, 0.24) + 0.30 * math.log(dscr / 1.6)), 0.45, 4.5)
    mean_share = sector.concentration / 100
    concentration = truncated(lambda: 100 * rng.betavariate(2.0, 2.0 * (1 - mean_share) / mean_share), 0.5, 90.0)
    # Bureau history: weaker cash flow and heavier leverage make late payments more likely and longer.
    stress = 1.4 * (1.5 - dscr) + 0.3 * (leverage - 2.0) + sector.risk
    dpd = 0
    if rng.random() < logistic(-1.0 + stress):
        roll = rng.random()
        dpd = (rng.randint(1, 15) if roll < 0.52 else rng.randint(16, 30) if roll < 0.74 else rng.randint(31, 60) if roll < 0.86
               else rng.randint(61, 89) if roll < 0.92 else min(540, 90 + int(rng.expovariate(1 / 60))))
    ltv = truncated(lambda: rng.gauss(54, 13), 20.0, 95.0) if rng.random() < sector.secured else None
    return {
        "year": year, "sector": letter, "sector_label": sector.label,
        "caen": rng.choices([code for code, _ in sector.caen], [w for _, w in sector.caen])[0],
        "county": rng.choices(list(COUNTY_WEIGHTS), weights)[0],
        "years_in_business": round(clip(1.0 + rng.gammavariate(2.0, (sector.age - 1.0) / 2.0), 1.0, 45.0), 1),
        "revenue_ron": revenue, "ebitda_margin_pct": round(margin, 1), "net_debt_ebitda": round(leverage, 2),
        "dscr": round(dscr, 2), "current_ratio": round(liquidity, 2), "client_concentration_pct": round(concentration, 1),
        "bureau_max_dpd": dpd, "ltv_pct": None if ltv is None else round(ltv, 1), "amount_ron": amount, "term_months": term,
    }


def propensities(case):
    """(approve, modify, decline) odds from the policy thresholds: hard failures mostly decline, borderline cases come back modified."""
    ltv = case["ltv_pct"] or 0.0
    if case["dscr"] < 1.0 or case["bureau_max_dpd"] >= 90 or case["net_debt_ebitda"] > 5.0:
        return 0.02, 0.06, 0.92
    if 1.0 <= case["dscr"] < 1.25 or ltv > 70:
        return 0.11, 0.76, 0.13
    if case["net_debt_ebitda"] > 3.5 or 30 < case["bureau_max_dpd"] < 90 or case["years_in_business"] < 2.0 or case["client_concentration_pct"] > 55:
        return 0.55, 0.36, 0.09
    return 0.92, 0.035, 0.045


def risk_logit(case):
    """Log-odds contribution of the case's own risk factors (the intercept is calibrated separately)."""
    return (-1.5 * (min(case["dscr"], 3.0) - 1.5) + 0.40 * (min(case["net_debt_ebitda"], 6.0) - 2.0)
            + 0.012 * min(case["bureau_max_dpd"], 120) + 0.025 * (case["client_concentration_pct"] - 25)
            - 0.05 * (min(case["years_in_business"], 20.0) - 8.0) + SECTORS[case["sector"]].risk + VINTAGE_RISK[case["year"]])


def pick(rng, logits, share):
    """Indices of a calibrated draw: the intercept is solved so the mean probability is `share`, then the draw is systematic
    (random order, one random offset), so each case keeps its own probability and the total is share x n within one case."""
    if not logits:
        return set()
    shift = solve(lambda b: mean(logistic(b + x) for x in logits), share)
    order = list(range(len(logits)))
    rng.shuffle(order)
    offset, total, picked = rng.random(), 0.0, set()
    for index in order:
        before = math.floor(total - offset)
        total += logistic(shift + logits[index])
        if math.floor(total - offset) > before:
            picked.add(index)
    return picked


def logit(p):
    return math.log(p / (1 - p))


def assign_decisions(rng, cases):
    """Rule-based odds per case, calibrated so the portfolio mix is TARGET_DECLINE / TARGET_MODIFY / the rest approved."""
    odds = [propensities(case) for case in cases]
    declined = pick(rng, [logit(decline) for _, _, decline in odds], TARGET_DECLINE)
    rest = [i for i in range(len(cases)) if i not in declined]
    modified = set()
    if rest:   # among the rest, MODIFY takes its share of the (approve + modify) odds
        shares = [logit(odds[i][1] / (odds[i][0] + odds[i][1])) for i in rest]
        modified = {rest[j] for j in pick(rng, shares, TARGET_MODIFY * len(cases) / len(rest))}
    for index, case in enumerate(cases):
        case["decision"] = "DECLINE" if index in declined else "MODIFY" if index in modified else "APPROVE"


def assign_outcomes(rng, cases):
    """24-month outcome of every non-declined case: logistic default odds, then a milder late-payment odds for the rest.

    Both are calibrated to TARGET_DEFAULT / TARGET_LATE of the approved and modified cases.
    """
    funded = [case for case in cases if case["decision"] != "DECLINE"]
    logits = [risk_logit(case) for case in funded]
    defaulted = pick(rng, logits, TARGET_DEFAULT)
    others = [i for i in range(len(funded)) if i not in defaulted]
    late = set()
    if others:
        late = {others[j] for j in pick(rng, [0.7 * logits[i] for i in others], TARGET_LATE * len(funded) / len(others))}
    for case in cases:
        case["outcome_24m"] = None
    for index, case in enumerate(funded):
        case["outcome_24m"] = "default" if index in defaulted else "late" if index in late else "performing"


def generate(seed=SEED, n=COUNT):
    """Return `n` synthetic past cases as dicts (CSV column order), identical for the same seed and count."""
    rng = random.Random(seed)
    letters = list(SECTORS)
    sectors = [letter for letter, count in zip(letters, allocate(n, [SECTORS[l].weight for l in letters])) for _ in range(count)]
    rng.shuffle(sectors)
    cases = [draw_case(rng, letter, rng.choices(YEARS, YEAR_WEIGHTS)[0]) for letter in sectors]
    assign_decisions(rng, cases)
    assign_outcomes(rng, cases)
    cases.sort(key=lambda case: case["year"])   # stable: ids follow the decision year
    return [{"id": f"H-{number:04d}", **{column: case[column] for column in COLUMNS[1:]}} for number, case in enumerate(cases, 1)]


def render_csv(rows):
    """CSV text: header row, fixed decimals, empty cells for missing LTV (unsecured) and outcome (declined)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(COLUMNS)
    for row in rows:
        writer.writerow(["" if row[c] is None else f"{row[c]:.{DECIMALS[c]}f}" if c in DECIMALS else row[c] for c in COLUMNS])
    return buffer.getvalue()


def write_csv(rows, path=OUTPUT):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        handle.write(render_csv(rows))
    return path


def summarize(rows):
    total = len(rows)
    if not total:
        return "0 cazuri istorice SINTETICE"
    decisions = {name: sum(row["decision"] == name for row in rows) for name in ("APPROVE", "MODIFY", "DECLINE")}
    funded = [row for row in rows if row["decision"] != "DECLINE"]
    outcomes = {name: sum(row["outcome_24m"] == name for row in funded) / max(len(funded), 1) for name in ("performing", "late", "default")}
    sectors = {letter: sum(row["sector"] == letter for row in rows) for letter in SECTORS}
    lines = [f"{total} cazuri istorice SINTETICE ({min(r['year'] for r in rows)}-{max(r['year'] for r in rows)})",
             "decizii: " + " · ".join(f"{name} {count} ({100 * count / total:.1f}%)" for name, count in decisions.items()),
             f"rezultat la 24 luni (aprobate/modificate, n={len(funded)}): "
             + " · ".join(f"{name} {100 * share:.1f}%" for name, share in outcomes.items()),
             "sectoare: " + " · ".join(f"{letter} {count}" for letter, count in sectors.items())]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate the synthetic past-cases history CSV.")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--count", type=int, default=COUNT)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args([] if argv is None else argv)
    rows = generate(args.seed, args.count)
    path = write_csv(rows, args.output)
    print(f"scris {path}")
    print(summarize(rows))


if __name__ == "__main__":
    main(sys.argv[1:])
