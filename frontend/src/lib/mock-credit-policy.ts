// Mock-only credit policy maths. Mirrors fixtures/credit/standards/RO-IMM-2026.10.json (synthetic policy).
// One source of truth for the mock scenario: the same functions produce the recommendation, the what-if and the re-evaluation.
import type { Recommendation, Terms, WhatIf } from "./agent-types";

export const POLICY = {
  version: "RO-IMM-2026.10",
  index: "ROBOR3M",
  margins: { A: 2.5, B: 3.0, C: 3.75 } as Record<"A" | "B" | "C", number>,
  stressPp: 2.0,
  dscrMin: 1.2,
  dscrStressedMin: 1.0,
  ndEbitdaMax: 3.5,
  ltvMaxPct: 70,
  roundingRon: 10_000,
  minTerm: 12,
  maxTerm: 120,
  bureauKnockoutDays: 90,
  clientConcentrationMaxPct: 40,
  turnoverGapTolerancePct: 10,
  authority: [
    { level: "L1" as const, maxGroupExposure: 500_000 },
    { level: "L2" as const, maxGroupExposure: 5_000_000 },
    { level: "L3" as const, maxGroupExposure: Infinity },
  ],
};

export type Profile = {
  caseId: string;
  company: string;
  riskClass: "A" | "B" | "C";
  cfads: number;          // cash available for debt service, RON / year
  existingDs: number;     // existing debt service, RON / year
  ebitda: number;
  netDebt: number;        // financial debt - cash, before the new loan
  collateral: number | null;
  existingGroup: number;  // group exposure already at the bank
  knockout: string | null;
  requested: { amount: number; term_months: number; product: string; purpose: string };
};

export type Level = "L1" | "L2" | "L3";

const annuity = (ratePct: number, n: number) => {
  const r = ratePct / 100 / 12;
  return r / (1 - Math.pow(1 + r, -n));
};
export const monthlyPayment = (amount: number, ratePct: number, n: number) => amount * annuity(ratePct, n);

export function levelFor(groupExposure: number): Level {
  return (POLICY.authority.find((a) => groupExposure <= a.maxGroupExposure) ?? POLICY.authority[2]!).level;
}

export function evalTerms(p: Profile, amount: number, termMonths: number, indexPct: number) {
  const margin = POLICY.margins[p.riskClass];
  const rate = indexPct + margin;
  const payment = monthlyPayment(amount, rate, termMonths);
  const dscr = p.cfads / (p.existingDs + 12 * payment);
  const stressed = p.cfads / (p.existingDs + 12 * monthlyPayment(amount, rate + POLICY.stressPp, termMonths));
  const ltv = p.collateral ? (amount / p.collateral) * 100 : null;
  const ndEbitda = (p.netDebt + amount) / p.ebitda;
  const checks = {
    dscr: dscr >= POLICY.dscrMin - 1e-9,
    stressed: stressed >= POLICY.dscrStressedMin - 1e-9,
    ltv: ltv === null || ltv <= POLICY.ltvMaxPct + 1e-9,
    nd: ndEbitda <= POLICY.ndEbitdaMax,
    knockout: p.knockout === null,
  };
  const passes = Object.values(checks).every(Boolean);
  const group = p.existingGroup + amount;
  return { margin, rate, payment, dscr, stressed, ltv, ndEbitda, checks, passes, level: levelFor(group), group };
}

const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

/** Largest amount (multiple of the policy rounding) at which every threshold holds, capped at the request. */
export function counterOffer(p: Profile, requested: number, termMonths: number, indexPct: number): number {
  const rate = indexPct + POLICY.margins[p.riskClass];
  const maxPayment = (p.cfads / POLICY.dscrMin - p.existingDs) / 12;
  const byDscr = maxPayment > 0 ? maxPayment / annuity(rate, termMonths) : 0;
  const byLtv = p.collateral ? (p.collateral * POLICY.ltvMaxPct) / 100 : Infinity;
  let amount = floorTo(Math.min(requested, byDscr, byLtv), POLICY.roundingRon);
  while (amount > 0 && !evalTerms(p, amount, termMonths, indexPct).passes) amount -= POLICY.roundingRon;
  return Math.max(0, amount);
}

export function termsFor(p: Profile, amount: number, termMonths: number, indexPct: number): Terms {
  const e = evalTerms(p, amount, termMonths, indexPct);
  return {
    amount,
    term_months: termMonths,
    rate_pct: round(e.rate, 2),
    margin_pct: e.margin,
    index: POLICY.index,
    index_value_pct: indexPct,
    monthly_payment: Math.round(e.payment),
    dscr: round(e.dscr, 2),
    dscr_stressed: round(e.stressed, 2),
    ltv_pct: e.ltv === null ? null : round(e.ltv, 1),
  };
}

export function whatIf(p: Profile, amount: number, termMonths: number, indexPct: number): WhatIf {
  const e = evalTerms(p, amount, termMonths, indexPct);
  return {
    amount,
    term_months: termMonths,
    rate_pct: round(e.rate, 2),
    monthly_payment: Math.round(e.payment),
    dscr: round(e.dscr, 2),
    dscr_stressed: round(e.stressed, 2),
    ltv_pct: e.ltv === null ? null : round(e.ltv, 1),
    passes: e.passes,
    level: e.level,
    level_reason: levelReason(e.level, p.existingGroup, amount),
  };
}

export function levelReason(level: Level, existing: number, amount: number): string {
  const total = existing + amount;
  const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const part = existing > 0 ? ` (${fmt(existing)} existentă + ${fmt(amount)} nouă)` : "";
  if (level === "L1") return `Expunere de grup ${fmt(total)} RON${part}, sub plafonul L1 de ${fmt(POLICY.authority[0]!.maxGroupExposure)} RON.`;
  if (level === "L2")
    return `Expunere de grup ${fmt(total)} RON${part}: peste plafonul L1 (${fmt(POLICY.authority[0]!.maxGroupExposure)} RON), în limita L2 (${fmt(POLICY.authority[1]!.maxGroupExposure)} RON) — decide ofițerul de risc.`;
  return `Expunere de grup ${fmt(total)} RON${part}: peste plafonul L2 (${fmt(POLICY.authority[1]!.maxGroupExposure)} RON) — decide comitetul de credit, cu 2 voturi.`;
}

export const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Wilson score interval (95%) in percent. */
export function wilson(k: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 100 };
  const z = 1.96;
  const ph = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (ph + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: round((centre - half) * 100, 1), high: round((centre + half) * 100, 1) };
}

export type { Recommendation };
