// Mock-only credit scenario for `npm run dev:mock` / Lovable preview. Plays the multi-agent run with timers.
// Never used against the real API. All names, numbers and documents are synthetic.
import { ApiError } from "./errors";
import { getMockUser } from "./mock-auth";
import { fmtInt, fmtNum, fmtPct, fmtRon, fmtSignedPct, fmtX } from "./format";
import type {
  AgentCard, AgentId, AgentRun, AgentState, AgentStep, Benchmark, Board, ClientRequest, CreditCaseSummary, CreditRole,
  Decision, GraphEdge, GraphNode, MarketState, Metric, Metrics, ModelUse, PlanItem, Precedent,
  Recommendation, ReviewFact, RuleResult, StepKind, StepStatus, Tier, WhatIf,
} from "./agent-types";
import type { CaseDetail, Doc, Evidence, User } from "./types";
import type { DecisionBody, OnRun, OnStep, ReviewBody } from "./api";
import {
  CF, codeforgeInitialDocs, codeforgeLaterDocs, makeDoc, nordicDocs, span, transportDocs, unverifiedSpan,
} from "./mock-credit-docs";
import {
  counterOffer, evalTerms, levelFor, levelReason, POLICY, round, termsFor, whatIf as calcWhatIf, wilson,
  type Level, type Profile,
} from "./mock-credit-policy";

export { fakeSha } from "./mock-credit-docs";

// ------------------------------------------------------------------ constants

const SMALL: ModelUse = { provider: "featherless", model: "Qwen/Qwen2.5-7B-Instruct", tier: "small", mode: "cloud" };
const LARGE: ModelUse = { provider: "featherless", model: "Qwen/Qwen2.5-14B-Instruct", tier: "large", mode: "cloud" };
const MODE_LABEL = "Cloud demo · featherless · Qwen2.5-14B / 7B · date sintetice";
const MARKET_SOURCE = "Snapshot sintetic în formatul fixingului BNR ROBOR 3M (valori fictive pentru demonstrație)";
const BUDGET = { limit: 36, deadline_s: 90 };

const AGENT_DEFS: { id: AgentId; title: string; role: string; tier: Tier }[] = [
  { id: "orchestrator", title: "Orchestrator", role: "Planifică, ține starea dosarului și aplică politicile de credit.", tier: "large" },
  { id: "analyst", title: "Analist financiar complex", role: "Coordonează specialiștii; compară cu cazuri din trecut și statistici de sector.", tier: "large" },
  { id: "completeness", title: "Agent Completitudine", role: "Verifică ce lipsește din dosar și cere automat documentele (portal client simulat).", tier: "small" },
  { id: "financials", title: "Agent Situații financiare", role: "Extrage, normalizează și calculează indicatori din situațiile financiare.", tier: "small" },
  { id: "cashflow", title: "Agent Fluxuri de numerar", role: "Extrase de cont: venituri și cheltuieli, concentrare pe clienți.", tier: "small" },
  { id: "kyb", title: "Agent KYB/Diligență", role: "Asociați, beneficiari reali, entități afiliate și expunere de grup.", tier: "small" },
  { id: "policy", title: "Agent Politică", role: "Verifică dosarul față de normele de creditare (date, nu prompt); se actualizează la ROBOR și standarde.", tier: "none" },
  { id: "memo", title: "Agent Memo", role: "Redactează nota de credit cu referințe la sursă.", tier: "large" },
  { id: "critic", title: "Agent Critic", role: "Contestă concluziile, caută contradicții și cere re-verificări.", tier: "large" },
  { id: "guard", title: "Gardă de acțiuni", role: "Blochează acțiunile interzise: aprobarea creditului, schimbarea politicii, ștergerea dovezilor.", tier: "none" },
  { id: "human", title: "Analist uman", role: "Decide: Aprobă / Modifică / Respinge, cu nivelul de autoritate cerut.", tier: "none" },
  { id: "client", title: "Client (portal simulat)", role: "Primește cererea consolidată de documente și răspunde în portal.", tier: "none" },
];

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => `2025-${m}`);
// thousands of RON; sums match 9.788.000 / 7.720.000 / 8.740.000 / 1.750.000 exactly
const INFLOW_K = [690, 702, 770, 745, 810, 835, 790, 760, 855, 905, 960, 966];
const OPERATING_K = [545, 556, 610, 590, 640, 660, 622, 600, 672, 712, 755, 758];
const LABS_K = [140, 145, 150, 140, 150, 155, 140, 135, 150, 160, 165, 120];
const OUTFLOW_K = [640, 650, 690, 700, 730, 745, 715, 705, 760, 800, 815, 790];

// ------------------------------------------------------------------ state

type Listener = { onStep: OnStep; onRun: OnRun };

type Extra = {
  yearsInBusiness: number;
  bureauDpd: number;
  topClientName: string | null;
  topClientPct: number | null;
  turnoverGapPct: number | null;
  revenueGrowthPct: number | null;
  extractAgeDays: number;
  docsComplete: boolean;
};

type CaseState = {
  id: string;
  title: string;
  company: string;
  cui: string;
  caen: string;
  channel: "online" | "sucursală";
  created_at: string;
  profile: Profile;
  extra: Extra;
  allDocs: Doc[];
  visible: Set<string>;
  run: AgentRun | null;
  listeners: Set<Listener>;
};

type Market = { index: string; snapshots: { as_of: string; value_pct: number; source: string }[] };

let STATE: Map<string, CaseState> | null = null;
let MARKET: Market | null = null;
let counter = 0;
const nextId = (p: string) => `${p}-${String(++counter).padStart(4, "0")}`;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const iso = (minutesAgo = 0) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const today = () => new Date().toISOString().slice(0, 10);

function need(): User {
  const u = getMockUser();
  if (!u) throw new ApiError(401, "Neautentificat");
  return u;
}
function mut(): User {
  const u = need();
  if (u.role === "supervisor") throw new ApiError(403, "Rolul de supervizor nu poate modifica dosarele de credit");
  return u;
}

function market(): Market {
  if (!MARKET) {
    MARKET = {
      index: POLICY.index,
      snapshots: [
        { as_of: "2026-09-30", value_pct: 5.72, source: MARKET_SOURCE },
        { as_of: "2026-10-27", value_pct: 5.8, source: MARKET_SOURCE },
      ],
    };
  }
  return MARKET;
}
const latestIndex = () => market().snapshots[market().snapshots.length - 1]!;

function marketState(): MarketState {
  const m = market();
  const last = latestIndex();
  return {
    index: m.index,
    value_pct: last.value_pct,
    as_of: last.as_of,
    source: last.source,
    policy_version: POLICY.version,
    history: [...m.snapshots].reverse().map((s) => ({ value_pct: s.value_pct, as_of: s.as_of, source: s.source })),
  };
}

const emptyBoard = (): Board => ({
  facts: [], metrics: [], issues: [], rules: [], financials: null, cashflow: null, kyb: null, analyst: null, memo: null,
  security: { injections: [], refused_actions: 0 },
});

const freshAgents = (): AgentCard[] =>
  AGENT_DEFS.map((d) => ({ id: d.id, title: d.title, role: d.role, status: "idle", runs: 0, tier: d.tier, last_summary: null }));

function newRun(st: CaseState, preparedBy: string, createdMinutesAgo = 0): AgentRun {
  const at = iso(createdMinutesAgo);
  return {
    id: nextId(`run-${st.id.replace("credit-", "")}`),
    case_id: st.id,
    status: "RUNNING",
    case_revision: 1,
    is_current: true,
    mode_label: MODE_LABEL,
    budget: { used: 0, limit: BUDGET.limit, deadline_s: BUDGET.deadline_s, elapsed_s: 0 },
    agents: freshAgents(),
    plan: [],
    steps: [],
    board: emptyBoard(),
    recommendation: null,
    requests: [],
    decision: null,
    prepared_by: preparedBy,
    created_at: at,
    updated_at: at,
  };
}

// ------------------------------------------------------------------ run mutation helpers

type StepInput = {
  agent: AgentId; kind: StepKind; title: string; thought?: string | null; task?: string | null; status?: StepStatus;
  model?: ModelUse | null; ms?: number | null; detail?: Record<string, unknown>; at?: string;
};

function notify(st: CaseState, step?: AgentStep) {
  const run = st.run;
  if (!run) return;
  for (const l of st.listeners) {
    if (step) l.onStep(structuredClone(step));
    l.onRun({ status: run.status, updated_at: run.updated_at });
  }
}

function pushStep(st: CaseState, i: StepInput): AgentStep {
  const run = st.run!;
  const step: AgentStep = {
    seq: run.steps.length + 1,
    agent: i.agent,
    kind: i.kind,
    title: i.title,
    thought: i.thought ?? null,
    task: i.task ?? null,
    status: i.status ?? "ok",
    model: i.model ?? null,
    duration_ms: i.ms ?? null,
    detail: i.detail ?? {},
    created_at: i.at ?? new Date().toISOString(),
  };
  run.steps.push(step);
  if (step.duration_ms) run.budget.elapsed_s = round(run.budget.elapsed_s + step.duration_ms / 1000, 1);
  run.updated_at = step.created_at;
  notify(st, step);
  return step;
}

const touch = (st: CaseState) => {
  if (!st.run) return;
  st.run.updated_at = new Date().toISOString();
  notify(st);
};

function spend(st: CaseState, calls: number) {
  const b = st.run!.budget;
  b.used = Math.min(b.limit, b.used + calls);
}

function setAgent(st: CaseState, id: AgentId, status: AgentState, summary?: string | null, bumpRuns = false) {
  const a = st.run!.agents.find((x) => x.id === id);
  if (!a) return;
  a.status = status;
  if (bumpRuns) a.runs += 1;
  if (summary !== undefined) a.last_summary = summary;
}

function setPlan(st: CaseState, task: string, status: PlanItem["status"]) {
  const item = st.run!.plan.find((p) => p.task === task);
  if (item) item.status = status;
}
function addPlan(st: CaseState, item: PlanItem, afterTask?: string) {
  const plan = st.run!.plan;
  if (plan.some((p) => p.task === item.task)) return;
  const idx = afterTask ? plan.findIndex((p) => p.task === afterTask) : -1;
  if (idx >= 0) plan.splice(idx + 1, 0, item);
  else plan.push(item);
}

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

const docOf = (st: CaseState, key: string): Doc => {
  const d = st.allDocs.find((x) => x.id === `${st.id}-${key}`);
  if (!d) throw new Error(`mock-credit: missing document ${key}`);
  return d;
};

type FactOpts = {
  id: string; agent: AgentId; label: string; field: string; value: string; doc: string; page?: number; quote?: string;
  normalized?: number | null; entity?: string; verified?: boolean; review?: ReviewFact["review"]; conflict?: boolean; note?: string;
};
function mkFact(st: CaseState, o: FactOpts): ReviewFact {
  const d = docOf(st, o.doc);
  const verified = o.verified ?? true;
  const quote = o.quote ?? o.value;
  return {
    id: o.id,
    entity_id: o.entity ?? "company",
    field: o.field,
    value: o.value,
    evidence: verified ? span(d, o.page ?? 1, quote) : unverifiedSpan(d, o.page ?? 1, quote),
    agent: o.agent,
    label: o.label,
    normalized: o.normalized ?? null,
    verified,
    review: o.review ?? "pending",
    conflict: o.conflict ?? false,
    note: o.note ?? null,
  };
}

const evOf = (b: Board, ...ids: string[]): Evidence[] => ids.flatMap((id) => (b.facts.find((f) => f.id === id) ? [b.facts.find((f) => f.id === id)!.evidence] : []));

function metric(
  b: Board, id: string, label: string, value: number, unit: Metric["unit"], display: string, agent: AgentId,
  formula: string | null, sources: Evidence[] = [], benchmark: Metric["benchmark"] = null,
) {
  upsert(b.metrics, { id, label, value, unit, display, agent, formula, sources, benchmark });
}

// ------------------------------------------------------------------ case construction

function buildCases(): Map<string, CaseState> {
  const map = new Map<string, CaseState>();

  const codeforge: CaseState = {
    id: "credit-codeforge",
    title: "Codeforge Digital SRL · Credit de investiții IMM",
    company: "Codeforge Digital SRL",
    cui: "46270185",
    caen: "6201",
    channel: "online",
    created_at: iso(60 * 5),
    profile: {
      caseId: "credit-codeforge", company: "Codeforge Digital SRL", riskClass: "B",
      cfads: 1_410_000, existingDs: 322_000, ebitda: 1_585_000, netDebt: 670_000, collateral: null, existingGroup: 0,
      knockout: null,
      requested: { amount: 3_900_000, term_months: 60, product: "Credit de investiții IMM", purpose: "achiziție sediu birouri" },
    },
    extra: { yearsInBusiness: 7, bureauDpd: 0, topClientName: null, topClientPct: null, turnoverGapPct: null, revenueGrowthPct: null, extractAgeDays: 13, docsComplete: false },
    allDocs: [],
    visible: new Set(),
    run: null,
    listeners: new Set(),
  };
  codeforge.allDocs = [...codeforgeInitialDocs, ...codeforgeLaterDocs].map((s) => makeDoc(codeforge.id, s));
  codeforgeInitialDocs.forEach((s) => codeforge.visible.add(`${codeforge.id}-${s.key}`));
  map.set(codeforge.id, codeforge);

  const nordic: CaseState = {
    id: "credit-nordic",
    title: "Nordic Timber Solutions SRL · Credit de investiții IMM",
    company: "Nordic Timber Solutions SRL",
    cui: "41562093",
    caen: "1610",
    channel: "sucursală",
    created_at: iso(60 * 26),
    profile: {
      caseId: "credit-nordic", company: "Nordic Timber Solutions SRL", riskClass: "B",
      cfads: 780_000, existingDs: 120_000, ebitda: 810_000, netDebt: 540_000, collateral: 2_600_000, existingGroup: 0,
      knockout: null,
      requested: { amount: 1_800_000, term_months: 48, product: "Credit de investiții IMM", purpose: "achiziție linie de debitare" },
    },
    extra: { yearsInBusiness: 9, bureauDpd: 0, topClientName: "Skogen Export AB", topClientPct: 31, turnoverGapPct: 3.1, revenueGrowthPct: 8.4, extractAgeDays: 19, docsComplete: true },
    allDocs: [],
    visible: new Set(),
    run: null,
    listeners: new Set(),
  };
  nordic.allDocs = nordicDocs.map((s) => makeDoc(nordic.id, s));
  nordic.allDocs.forEach((d) => nordic.visible.add(d.id));
  map.set(nordic.id, nordic);

  const transport: CaseState = {
    id: "credit-transport",
    title: "Transport Rapid Dunărea SRL · Credit de investiții IMM",
    company: "Transport Rapid Dunărea SRL",
    cui: "29877341",
    caen: "4941",
    channel: "sucursală",
    created_at: iso(60 * 50),
    profile: {
      caseId: "credit-transport", company: "Transport Rapid Dunărea SRL", riskClass: "C",
      cfads: 310_000, existingDs: 150_000, ebitda: 395_000, netDebt: 260_000, collateral: 520_000, existingGroup: 0,
      knockout: "Restanță de 95 de zile la Biroul de Credit (prag eliminatoriu: 90 de zile)",
      requested: { amount: 420_000, term_months: 36, product: "Credit de investiții IMM", purpose: "achiziție 2 autoutilitare" },
    },
    extra: { yearsInBusiness: 11, bureauDpd: 95, topClientName: "Dunărea Cargo SA", topClientPct: 44, turnoverGapPct: 4.2, revenueGrowthPct: -12.1, extractAgeDays: 27, docsComplete: true },
    allDocs: [],
    visible: new Set(),
    run: null,
    listeners: new Set(),
  };
  transport.allDocs = transportDocs.map((s) => makeDoc(transport.id, s));
  transport.allDocs.forEach((d) => transport.visible.add(d.id));
  map.set(transport.id, transport);

  seedNordic(nordic);
  seedTransport(transport);
  return map;
}

function state(): Map<string, CaseState> {
  if (!STATE) STATE = buildCases();
  return STATE;
}
function caseOf(id: string): CaseState {
  const st = state().get(id);
  if (!st) throw new ApiError(404, "Dosar inexistent");
  return st;
}
function runLocation(runId: string): CaseState {
  for (const st of state().values()) if (st.run?.id === runId) return st;
  throw new ApiError(404, "Rulare inexistentă");
}

// ------------------------------------------------------------------ policy evaluation (shared by all cases)

function groupExposureNote(st: CaseState): number {
  return st.run?.board.kyb?.group_exposure ?? st.profile.existingGroup;
}

function buildRules(st: CaseState): RuleResult[] {
  const P = st.profile;
  const idx = latestIndex().value_pct;
  const req = P.requested;
  const e = evalTerms(P, req.amount, req.term_months, idx);
  const x = st.extra;
  const out: RuleResult[] = [];
  const add = (r: Omit<RuleResult, "metric_refs"> & { metric_refs?: string[] }) => out.push({ metric_refs: [], ...r });
  add({ rule_id: "CR-01", title: "DSCR minim la suma cerută", outcome: e.checks.dscr ? "PASS" : "FAIL", detail: `La ${fmtRon(req.amount)} / ${req.term_months} luni rata este ${fmtRon(e.payment)} pe lună.`, value: fmtX(e.dscr), threshold: `≥ ${fmtX(POLICY.dscrMin)}`, metric_refs: ["dscr_requested"] });
  add({ rule_id: "CR-02", title: "DSCR stresat (+2 p.p. dobândă)", outcome: e.checks.stressed ? "PASS" : "FAIL", detail: "Scenariu de stres: indexul crește cu 2,00 puncte procentuale.", value: fmtX(e.stressed), threshold: `≥ ${fmtX(POLICY.dscrStressedMin)}`, metric_refs: ["dscr_stressed_requested"] });
  add({ rule_id: "CR-03", title: "Datorie netă / EBITDA după creditare", outcome: e.checks.nd ? "PASS" : "FAIL", detail: "Datoria netă existentă plus suma cerută, raportată la EBITDA 2025.", value: fmtX(e.ndEbitda), threshold: `≤ ${fmtX(POLICY.ndEbitdaMax, 1)}`, metric_refs: ["nd_ebitda_requested"] });
  if (P.collateral) add({ rule_id: "CR-04", title: "LTV maxim (garanție imobiliară)", outcome: e.checks.ltv ? "PASS" : "FAIL", detail: `Valoare de piață a garanției: ${fmtRon(P.collateral)}.`, value: fmtPct(e.ltv!), threshold: `≤ ${POLICY.ltvMaxPct}%`, metric_refs: ["ltv_requested", "collateral_value"] });
  add({ rule_id: "CR-05", title: "Vechime în afaceri", outcome: x.yearsInBusiness >= 2 ? "PASS" : "FAIL", detail: "Din data înmatriculării în certificatul constatator.", value: `${x.yearsInBusiness} ani`, threshold: "≥ 2 ani", metric_refs: ["years_in_business"] });
  add({ rule_id: "CR-06", title: "Restanțe la Biroul de Credit", outcome: x.bureauDpd >= POLICY.bureauKnockoutDays ? "FAIL" : x.bureauDpd > 30 ? "WARN" : "PASS", detail: x.bureauDpd >= POLICY.bureauKnockoutDays ? "Criteriu eliminatoriu: restanță de cel puțin 90 de zile." : "Fără restanțe peste 30 de zile.", value: `${x.bureauDpd} zile`, threshold: "< 30 zile (eliminatoriu ≥ 90)", metric_refs: ["bureau_dpd"] });
  if (x.topClientPct !== null)
    add({ rule_id: "CR-07", title: "Concentrare pe client", outcome: x.topClientPct > POLICY.clientConcentrationMaxPct ? "FAIL" : x.topClientPct >= POLICY.clientConcentrationMaxPct - 5 ? "WARN" : "PASS", detail: `${x.topClientName}: ${fmtPct(x.topClientPct, 0)} din încasările operaționale.`, value: fmtPct(x.topClientPct, 0), threshold: `≤ ${POLICY.clientConcentrationMaxPct}%`, metric_refs: ["top_client_share"] });
  if (x.turnoverGapPct !== null)
    add({ rule_id: "CR-08", title: "Abatere cifră de afaceri vs. încasări operaționale", outcome: Math.abs(x.turnoverGapPct) <= POLICY.turnoverGapTolerancePct ? "PASS" : "FAIL", detail: "După reclasificarea fluxurilor intragrup.", value: fmtSignedPct(x.turnoverGapPct), threshold: `±${POLICY.turnoverGapTolerancePct}%`, metric_refs: ["turnover_gap_pct"] });
  if (x.revenueGrowthPct !== null)
    add({ rule_id: "CR-09", title: "Scădere maximă a cifrei de afaceri", outcome: x.revenueGrowthPct >= -20 ? "PASS" : "FAIL", detail: "Evoluție 2025 față de 2024.", value: fmtSignedPct(x.revenueGrowthPct), threshold: "≥ −20%", metric_refs: ["revenue_growth"] });
  add({ rule_id: "CR-10", title: "Vechimea certificatului constatator", outcome: x.extractAgeDays <= 90 ? "PASS" : "FAIL", detail: "Număr de zile de la emitere.", value: `${x.extractAgeDays} zile`, threshold: "≤ 90 zile" });
  add({ rule_id: "CR-11", title: "Documente obligatorii", outcome: x.docsComplete ? "PASS" : "UNKNOWN", detail: x.docsComplete ? "Toate documentele din lista de politică sunt la dosar." : "Lipsesc documente cerute clientului.", value: x.docsComplete ? "complet" : "incomplet", threshold: "complet" });
  return out;
}

function evaluatePolicy(st: CaseState): { rec: Recommendation; req: ReturnType<typeof evalTerms> } {
  const P = st.profile;
  const m = marketState();
  const idx = m.value_pct;
  const rq = P.requested;
  const req = evalTerms(P, rq.amount, rq.term_months, idx);
  const reasons: Recommendation["reasons"] = [];
  const conditions: string[] = [];
  const x = st.extra;

  if (P.knockout) reasons.push({ code: "CR-06", text: P.knockout, refs: ["bureau_dpd"] });
  if (!req.checks.dscr) reasons.push({ code: "CR-01", text: `DSCR ${fmtX(req.dscr)} la suma cerută, sub pragul minim de ${fmtX(POLICY.dscrMin)}`, refs: ["dscr_requested"] });
  if (!req.checks.stressed) reasons.push({ code: "CR-02", text: `DSCR stresat ${fmtX(req.stressed)} la suma cerută, sub ${fmtX(POLICY.dscrStressedMin)}`, refs: ["dscr_stressed_requested"] });
  if (!req.checks.ltv) reasons.push({ code: "CR-04", text: `LTV ${fmtPct(req.ltv!)} la suma cerută, peste limita de ${POLICY.ltvMaxPct}%`, refs: ["ltv_requested", "collateral_value"] });
  if (!req.checks.nd) reasons.push({ code: "CR-03", text: `Datorie netă / EBITDA ${fmtX(req.ndEbitda)}, peste ${fmtX(POLICY.ndEbitdaMax, 1)}`, refs: ["nd_ebitda_requested"] });
  if (x.topClientPct !== null && x.topClientPct >= POLICY.clientConcentrationMaxPct - 5)
    reasons.push({ code: "CR-07", text: `Concentrare: ${x.topClientName} reprezintă ${fmtPct(x.topClientPct, 0)} din încasările operaționale (limită ${POLICY.clientConcentrationMaxPct}%)`, refs: ["top_client_share"] });

  let decision: Recommendation["decision"];
  let proposed: Recommendation["proposed"] = null;
  let levelAmount = rq.amount;

  if (P.knockout) {
    decision = "DECLINE";
  } else if (req.passes) {
    decision = "APPROVE_WITH_CONDITIONS";
    proposed = termsFor(P, rq.amount, rq.term_months, idx);
  } else {
    const offer = counterOffer(P, rq.amount, rq.term_months, idx);
    if (offer > 0) {
      decision = "COUNTER_OFFER";
      proposed = termsFor(P, offer, rq.term_months, idx);
      levelAmount = offer;
      reasons.push({ code: "CR-OFFER", text: `Contraoferta de ${fmtRon(offer)} restabilește DSCR ${fmtX(proposed.dscr)} și LTV ${proposed.ltv_pct === null ? "—" : fmtPct(proposed.ltv_pct)}`, refs: ["dscr_proposed", "ltv_proposed"] });
    } else {
      decision = "DECLINE";
    }
  }

  const existing = groupExposureNote(st);
  if (existing > 0 && decision !== "DECLINE")
    reasons.push({ code: "KYB-02", text: `Entitate afiliată în grup: expunere totală ${fmtRon(existing + levelAmount)} cu operațiunea propusă`, refs: ["group_exposure", "group_exposure_total"] });

  if (decision === "COUNTER_OFFER" || decision === "APPROVE_WITH_CONDITIONS") {
    if (P.collateral) conditions.push(`Ipotecă de rang I asupra imobilului, valoare de evaluare ${fmtRon(P.collateral)}`);
    conditions.push("Asigurarea imobilului cu cesiune de drepturi în favoarea băncii");
    if (x.topClientPct !== null && x.topClientPct >= POLICY.clientConcentrationMaxPct - 5) conditions.push(`Raportare trimestrială a încasărilor de la ${x.topClientName}`);
    if (existing > 0) conditions.push("Declarație de nesubordonare a datoriilor către asociați și entități afiliate");
  }

  const level: Level = decision === "DECLINE" ? levelFor(P.existingGroup + rq.amount) : levelFor(existing + levelAmount);
  const reason = decision === "DECLINE" ? `Respingere pe criteriu eliminatoriu; expunere de grup ${fmtRon(existing + rq.amount)}.` : levelReason(level, existing, levelAmount);

  const rec: Recommendation = {
    decision,
    requested: { amount: rq.amount, term_months: rq.term_months, product: rq.product, purpose: rq.purpose },
    proposed,
    reasons,
    conditions,
    level,
    level_reason: decision === "DECLINE" && level === "L1" ? `Respingere pe criteriu eliminatoriu; expunere de grup ${fmtRon(existing + rq.amount)} ≤ ${fmtRon(POLICY.authority[0]!.maxGroupExposure)} (L1).` : reason,
    policy_version: POLICY.version,
    market: { index: m.index, value_pct: m.value_pct, as_of: m.as_of, source: m.source },
    superseded: false,
  };
  return { rec, req };
}

/** Writes policy metrics + rules into the board and returns the recommendation. */
function applyPolicyToBoard(st: CaseState): Recommendation {
  const run = st.run!;
  const b = run.board;
  const P = st.profile;
  const x = st.extra;
  const idx = latestIndex().value_pct;
  const { rec, req } = evaluatePolicy(st);
  const rq = P.requested;
  const prop = rec.proposed;
  const existing = groupExposureNote(st);

  const dscrBench: Metric["benchmark"] = { sector: "J", p25: 1.25, median: 1.55, p75: 2.05, percentile: 8 };
  metric(b, "dscr_requested", `DSCR la suma cerută (${fmtInt(rq.amount)} RON)`, round(req.dscr, 2), "x", fmtX(req.dscr), "policy", `CFADS / serviciul datoriei = ${fmtInt(P.cfads)} / (${fmtInt(P.existingDs)} + ${fmtInt(12 * req.payment)})`, evOf(b, "fin_ebit25", "fin_dep25"), P.cfads > 0 ? dscrBench : null);
  metric(b, "dscr_stressed_requested", "DSCR stresat la suma cerută", round(req.stressed, 2), "x", fmtX(req.stressed), "policy", `Aceeași formulă cu dobânda +${fmtNum(POLICY.stressPp)} p.p.`);
  metric(b, "nd_ebitda_requested", "Datorie netă / EBITDA după creditare", round(req.ndEbitda, 2), "x", fmtX(req.ndEbitda), "policy", `(${fmtInt(P.netDebt)} + ${fmtInt(rq.amount)}) / ${fmtInt(P.ebitda)}`, evOf(b, "fin_debt25", "fin_cash25"), { sector: "J", p25: 0.8, median: 1.7, p75: 2.6, percentile: 82 });
  metric(b, "rate", "Dobândă", round(req.rate, 2), "%", fmtPct(req.rate, 2), "policy", `${POLICY.index} ${fmtPct(idx, 2)} + marjă ${fmtNum(req.margin)} p.p. (clasa ${P.riskClass})`);
  metric(b, "years_in_business", "Vechime în afaceri", x.yearsInBusiness, "ani", `${x.yearsInBusiness} ani`, "kyb", "Din data înmatriculării", evOf(b, "kyb_reg_date"));
  metric(b, "bureau_dpd", "Restanță maximă la Biroul de Credit", x.bureauDpd, "zile", `${x.bureauDpd} zile`, "kyb", null, evOf(b, "bureau_dpd"));
  if (P.collateral) metric(b, "ltv_requested", "LTV la suma cerută", round(req.ltv!, 1), "%", fmtPct(req.ltv!), "policy", `${fmtInt(rq.amount)} / ${fmtInt(P.collateral)}`, evOf(b, "val_mkt"));
  if (prop) {
    metric(b, "amount_proposed", "Suma propusă", prop.amount, "RON", fmtRon(prop.amount), "policy", `Maxim care respectă DSCR ${fmtX(POLICY.dscrMin)} și LTV ${POLICY.ltvMaxPct}%, rotunjit la ${fmtInt(POLICY.roundingRon)}`);
    metric(b, "payment_proposed", "Rată lunară propusă", prop.monthly_payment, "RON", fmtRon(prop.monthly_payment), "policy", `Anuitate: ${fmtInt(prop.amount)} la ${fmtPct(prop.rate_pct, 2)}, ${prop.term_months} luni`);
    metric(b, "dscr_proposed", "DSCR la suma propusă", prop.dscr, "x", fmtX(prop.dscr), "policy", `${fmtInt(P.cfads)} / (${fmtInt(P.existingDs)} + ${fmtInt(12 * prop.monthly_payment)})`, [], dscrBench);
    metric(b, "dscr_stressed_proposed", "DSCR stresat la suma propusă", prop.dscr_stressed, "x", fmtX(prop.dscr_stressed), "policy", `Dobândă +${fmtNum(POLICY.stressPp)} p.p.`);
    if (prop.ltv_pct !== null) metric(b, "ltv_proposed", "LTV la suma propusă", prop.ltv_pct, "%", fmtPct(prop.ltv_pct), "policy", `${fmtInt(prop.amount)} / ${fmtInt(P.collateral ?? 0)}`, evOf(b, "val_mkt"));
    if (existing > 0) metric(b, "group_exposure_total", "Expunere de grup cu operațiunea propusă", existing + prop.amount, "RON", fmtRon(existing + prop.amount), "policy", `${fmtInt(existing)} existentă + ${fmtInt(prop.amount)} propusă`);
  }

  b.rules = buildRules(st);

  // Issues raised / resolved by the policy agent.
  const blocking = !req.passes;
  if (blocking) {
    upsert(b.issues, {
      id: "ISS-POL-1", agent: "policy", severity: "blocking",
      title: P.knockout ? "Criteriu eliminatoriu încălcat" : "Pragurile de politică nu sunt respectate la suma cerută",
      detail: P.knockout ?? `DSCR ${fmtX(req.dscr)} și/sau LTV ${req.ltv === null ? "—" : fmtPct(req.ltv)} în afara limitelor la ${fmtRon(rq.amount)}.`,
      refs: ["dscr_requested", ...(P.collateral ? ["ltv_requested"] : [])],
      status: prop ? "resolved" : "open",
      resolution: prop ? `Contraofertă ${fmtRon(prop.amount)} care respectă pragurile` : null,
    });
  } else {
    b.issues = b.issues.filter((i) => i.id !== "ISS-POL-1");
  }
  return rec;
}

function memoFor(st: CaseState, rec: Recommendation): NonNullable<Board["memo"]> {
  const run = st.run!;
  const b = run.board;
  const P = st.profile;
  const rq = P.requested;
  const x = st.extra;
  const disp = (id: string) => b.metrics.find((m) => m.id === id)?.display ?? "—";
  const prop = rec.proposed;
  const existing = groupExposureNote(st);
  const lines: string[] = [];
  lines.push(`## Cerere`);
  lines.push(`${st.company} (CUI ${st.cui}, CAEN ${st.caen}) solicită un ${rq.product.toLowerCase()} de ${fmtRon(rq.amount)} pe ${rq.term_months} luni pentru ${rq.purpose}${P.collateral ? ", garantat cu ipotecă de rang I asupra imobilului" : ""}.`);
  if (b.financials) {
    lines.push(`## Capacitate de rambursare`);
    const growth = x.revenueGrowthPct !== null ? ` (${disp("revenue_growth")} față de 2024)` : "";
    lines.push(`Cifra de afaceri 2025 a fost de ${disp("revenue_2025")}${growth}, cu EBITDA de ${disp("ebitda_2025")} (marjă ${disp("ebitda_margin")}) și profit net de ${disp("net_profit_2025")}.`);
    if (b.cashflow && x.turnoverGapPct !== null) {
      lines.push(`Încasările în cont au fost de ${disp("inflow_total")}, din care ${disp("operating_inflow")} operaționale; abaterea față de cifra de afaceri este ${disp("turnover_gap_pct")}, în toleranța de ${POLICY.turnoverGapTolerancePct}%, după reclasificarea fluxurilor cu Codeforge Labs SRL (entitate afiliată). Cel mai mare client, ${x.topClientName}, reprezintă ${disp("top_client_share")} din încasările operaționale (limită ${POLICY.clientConcentrationMaxPct}%).`);
    }
  }
  if (b.kyb && existing > 0) {
    lines.push(`## Grup și expunere`);
    lines.push(`Codeforge Labs SRL este afiliată prin Ana-Maria Georgescu. Expunerea de grup existentă este ${disp("group_exposure")}${prop ? `; cu operațiunea propusă ajunge la ${disp("group_exposure_total")}, nivel de aprobare ${rec.level}` : ""}.`);
  }
  lines.push(`## Politică de creditare`);
  if (P.collateral) lines.push(`La suma cerută DSCR este ${disp("dscr_requested")} (minim ${fmtX(POLICY.dscrMin)}) iar LTV ${disp("ltv_requested")} (maxim ${POLICY.ltvMaxPct}%). Dobânda este ${disp("rate")} (${POLICY.index} ${fmtPct(rec.market.value_pct, 2)} + marjă ${fmtNum(POLICY.margins[P.riskClass])} p.p.).`);
  else lines.push(`La suma cerută DSCR este ${disp("dscr_requested")} (minim ${fmtX(POLICY.dscrMin)}). ${P.knockout ?? ""}`.trim());
  lines.push(`## Recomandare`);
  if (rec.decision === "DECLINE") lines.push(`Respingere. ${rec.reasons[0]?.text ?? ""}.`);
  else if (prop) {
    lines.push(`${rec.decision === "COUNTER_OFFER" ? "Contraofertă" : "Aprobare cu condiții"}: ${disp("amount_proposed")} pe ${prop.term_months} luni, rată lunară ${disp("payment_proposed")}, DSCR ${disp("dscr_proposed")} (stresat ${disp("dscr_stressed_proposed")})${prop.ltv_pct !== null ? `, LTV ${disp("ltv_proposed")}` : ""}.`);
    rec.conditions.forEach((c) => lines.push(`- ${c}`));
  }
  if (b.security.injections.length) {
    lines.push(`## Observații de securitate`);
    lines.push(`Raportul de evaluare conținea o instrucțiune adresată asistentului AI; a fost ignorată și raportată.`);
  }
  const text = lines.join("\n\n").replace(/\n\n- /g, "\n- ");
  const matched = b.metrics.filter((m) => m.display && text.includes(m.display));
  const distinct = new Set(matched.map((m) => m.display));
  return { text, verified_numbers: distinct.size, unverified: [], model: LARGE };
}

// ------------------------------------------------------------------ Codeforge script

type Turn = { agent: AgentId; plan?: string; run: (st: CaseState) => void };

function play(st: CaseState, turns: Turn[], onDone?: (st: CaseState) => void) {
  let i = 0;
  const begin = (t: Turn) => {
    setAgent(st, t.agent, "running", undefined, true);
    if (t.plan) setPlan(st, t.plan, "running");
    touch(st);
  };
  const next = () => {
    const t = turns[i]!;
    t.run(st);
    i += 1;
    if (i < turns.length) {
      begin(turns[i]!);
      setTimeout(next, 500 + Math.round(Math.random() * 400));
    } else onDone?.(st);
  };
  begin(turns[0]!);
  setTimeout(next, 600 + Math.round(Math.random() * 300));
}

const PLAN0: Omit<PlanItem, "status">[] = [
  { task: "completeness.check", agent: "completeness", why: "Verifică ce documente lipsesc față de lista obligatorie de politică." },
  { task: "financials.extract", agent: "financials", why: "Extrage și normalizează situațiile financiare; calculează EBITDA și marje." },
  { task: "cashflow.analyze", agent: "cashflow", why: "Analizează extrasele de cont: venituri, cheltuieli, concentrare pe clienți." },
  { task: "kyb.map", agent: "kyb", why: "Identifică asociații, beneficiarii reali, entitățile afiliate și expunerea de grup." },
  { task: "analyst.assess", agent: "analyst", why: "Compară cu cazuri din trecut și cu statistici de sector." },
  { task: "policy.evaluate", agent: "policy", why: `Verifică față de normele ${POLICY.version} (date versionate, nu prompt).` },
  { task: "memo.draft", agent: "memo", why: "Redactează nota de credit cu referințe la sursă." },
  { task: "critic.review", agent: "critic", why: "Contestă concluziile și caută contradicții înainte de decizia umană." },
];

function cashflowBoard(pass: 1 | 2): NonNullable<Board["cashflow"]> {
  const labs = LABS_K.map((v) => v * 1000);
  const op2 = OPERATING_K.map((v) => v * 1000);
  const op = pass === 1 ? op2.map((v, i) => v + labs[i]!) : op2;
  const monthly = MONTHS.map((month, i) => ({ month, inflow: INFLOW_K[i]! * 1000, outflow: OUTFLOW_K[i]! * 1000, operating_inflow: op[i]! }));
  const opTotal = op.reduce((a, v) => a + v, 0);
  const share = (n: number, d: number) => round((n / d) * 100, 1);
  if (pass === 1) {
    return {
      period: "ian–dec 2025",
      monthly,
      classes: [
        { key: "operational", label: "Operațional", amount: opTotal, share_pct: share(opTotal, 9_788_000) },
        { key: "intragroup", label: "Intragrup", amount: 0, share_pct: 0 },
        { key: "associates", label: "Asociați", amount: 120_000, share_pct: share(120_000, 9_788_000) },
        { key: "financial", label: "Financiar", amount: 198_000, share_pct: share(198_000, 9_788_000) },
      ],
      top_clients: [
        { name: "Hanse Logistik GmbH", amount: 2_933_600, share_pct: share(2_933_600, opTotal) },
        { name: "Codeforge Labs SRL", amount: 1_750_000, share_pct: share(1_750_000, opTotal) },
        { name: "Nordwind Retail AG", amount: 1_312_400, share_pct: share(1_312_400, opTotal) },
        { name: "Alpine Fintech SA", amount: 926_400, share_pct: share(926_400, opTotal) },
        { name: "Beta Soft Solutions SRL", amount: 694_800, share_pct: share(694_800, opTotal) },
        { name: "Alți 41 de clienți", amount: 1_852_800, share_pct: share(1_852_800, opTotal) },
      ],
    };
  }
  return {
    period: "ian–dec 2025",
    monthly,
    classes: [
      { key: "operational", label: "Operațional", amount: opTotal, share_pct: share(opTotal, 9_788_000) },
      { key: "intragroup", label: "Intragrup", amount: 1_750_000, share_pct: share(1_750_000, 9_788_000) },
      { key: "associates", label: "Asociați", amount: 120_000, share_pct: share(120_000, 9_788_000) },
      { key: "financial", label: "Financiar", amount: 198_000, share_pct: share(198_000, 9_788_000) },
    ],
    top_clients: [
      { name: "Hanse Logistik GmbH", amount: 2_933_600, share_pct: 38.0 },
      { name: "Nordwind Retail AG", amount: 1_312_400, share_pct: 17.0 },
      { name: "Alpine Fintech SA", amount: 926_400, share_pct: 12.0 },
      { name: "Beta Soft Solutions SRL", amount: 694_800, share_pct: 9.0 },
      { name: "Alți 41 de clienți", amount: 1_852_800, share_pct: 24.0 },
    ],
  };
}

function codeforgePhase1(): Turn[] {
  const turns: Turn[] = [
    {
      agent: "orchestrator",
      run: (s) => {
        s.run!.plan = PLAN0.map((p) => ({ ...p, status: "pending" as const }));
        pushStep(s, {
          agent: "orchestrator", kind: "plan", title: "Plan de lucru: 8 sarcini, 6 agenți", task: "orchestrator.plan", model: LARGE, ms: 1840,
          thought: `Credit de investiții IMM de ${fmtRon(s.profile.requested.amount)}, garantat ipotecar. Mai întâi completitudinea, apoi cifrele (situații și fluxuri) și KYB; politica rulează doar pe date verificate.`,
          detail: { tasks: 8, policy_version: POLICY.version, processing_mode: "cloud" },
        });
        setAgent(s, "orchestrator", "done", "Plan cu 8 sarcini");
        spend(s, 1);
      },
    },
    {
      agent: "analyst",
      run: (s) => {
        pushStep(s, {
          agent: "analyst", kind: "dispatch", title: "Analistul financiar delegă sarcinile specialiștilor", task: "analyst.dispatch", model: LARGE, ms: 960,
          thought: "Încep cu completitudinea; situațiile financiare și fluxurile pot rula imediat ce știu ce documente am.",
          detail: { delegates: ["completeness", "financials", "cashflow", "kyb"] },
        });
        setAgent(s, "analyst", "running", "Coordonează 7 specialiști");
        spend(s, 2);
      },
    },
    {
      agent: "completeness", plan: "completeness.check",
      run: (s) => {
        upsert(s.run!.board.issues, {
          id: "ISS-CMP-1", agent: "completeness", severity: "warning", title: "Documente lipsă din dosar",
          detail: "Lipsesc situațiile financiare 2024 și raportul de evaluare a garanției imobiliare.", refs: ["fs_previous", "collateral_valuation"], status: "open", resolution: null,
        });
        s.run!.board.facts.push(mkFact(s, { id: "cmp_amount", agent: "completeness", label: "Suma solicitată", field: "requested_amount", value: "3.900.000 RON", normalized: 3_900_000, doc: "cerere", quote: "Suma solicitată: 3.900.000 RON" }));
        pushStep(s, {
          agent: "completeness", kind: "result", title: "Lipsesc 2 documente: situațiile financiare 2024 și raportul de evaluare", task: "completeness.check", model: SMALL, ms: 1210, status: "warning",
          detail: { present: 5, required: 7, missing: ["fs_previous", "collateral_valuation"], policy: POLICY.version },
        });
        setAgent(s, "completeness", "done", "Lipsesc 2 documente");
        setPlan(s, "completeness.check", "done");
        spend(s, 2);
      },
    },
    {
      agent: "financials", plan: "financials.extract",
      run: (s) => {
        const b = s.run!.board;
        const f = (o: Omit<FactOpts, "agent">) => b.facts.push(mkFact(s, { ...o, agent: "financials" }));
        f({ id: "fin_rev25", label: "Cifra de afaceri 2025", field: "revenue_2025", value: "7.900.000", normalized: 7_900_000, doc: "sit2025", quote: "Cifra de afaceri netă: 7.900.000" });
        f({ id: "fin_dep25", label: "Cheltuieli cu amortizarea 2025", field: "depreciation_2025", value: "160.000", normalized: 160_000, doc: "sit2025", quote: "Cheltuieli cu amortizarea: 160.000" });
        f({ id: "fin_ebit25", label: "Rezultat din exploatare 2025", field: "operating_profit_2025", value: "1.425.000", normalized: 1_425_000, doc: "sit2025", quote: "Rezultat din exploatare: 1.425.000" });
        f({ id: "fin_net25", label: "Rezultat net 2025", field: "net_profit_2025", value: "1.120.000", normalized: 1_120_000, doc: "sit2025", quote: "Rezultat net al exercițiului: 1.120.000" });
        f({ id: "fin_debt25", label: "Datorii financiare", field: "financial_debt", value: "1.150.000", normalized: 1_150_000, doc: "sit2025", page: 2, quote: "Datorii financiare (credite și leasing): 1.150.000" });
        f({ id: "fin_cash25", label: "Disponibilități bănești", field: "cash", value: "480.000", normalized: 480_000, doc: "sit2025", page: 2, quote: "Disponibilități bănești: 480.000" });
        f({ id: "fin_rev25_alt", label: "Cifra de afaceri 2025 (variantă respinsă)", field: "revenue_2025", value: "79.000.000", normalized: 79_000_000, doc: "sit2025", quote: "Cifra de afaceri netă: 79.000.000", verified: false, review: "rejected", note: "Citatul nu apare în documentul stocat: valoare inventată de model, respinsă automat de verificator." });
        b.financials = {
          years: [{ year: 2025, items: { revenue: 7_900_000, depreciation: 160_000, operating_profit: 1_425_000, ebitda: 1_585_000, net_profit: 1_120_000, financial_debt: 1_150_000, cash: 480_000, equity: 3_150_000, total_assets: 6_200_000 } }],
        };
        metric(b, "revenue_2025", "Cifra de afaceri 2025", 7_900_000, "RON", fmtRon(7_900_000), "financials", null, evOf(b, "fin_rev25"));
        metric(b, "ebitda_2025", "EBITDA 2025", 1_585_000, "RON", fmtRon(1_585_000), "financials", "Rezultat din exploatare + amortizare = 1.425.000 + 160.000", evOf(b, "fin_ebit25", "fin_dep25"));
        metric(b, "ebitda_margin", "Marjă EBITDA 2025", 20.06, "%", fmtPct(20.06), "financials", "EBITDA / cifra de afaceri = 1.585.000 / 7.900.000", evOf(b, "fin_ebit25", "fin_dep25", "fin_rev25"), { sector: "J", p25: 14, median: 19, p75: 26, percentile: 56 });
        metric(b, "net_profit_2025", "Profit net 2025", 1_120_000, "RON", fmtRon(1_120_000), "financials", null, evOf(b, "fin_net25"));
        pushStep(s, {
          agent: "financials", kind: "result", title: "Situații 2025: CA 7.900.000 RON · EBITDA 1.585.000 RON · marjă 20,1% · profit net 1.120.000 RON", task: "financials.extract", model: SMALL, ms: 2310,
          detail: { facts: 7, verified: 6, rejected: 1, rejected_reason: "citat inexistent în document" },
        });
        setAgent(s, "financials", "done", "CA 2025 7.900.000 RON; marjă EBITDA 20,1%");
        setPlan(s, "financials.extract", "done");
        spend(s, 3);
      },
    },
    {
      agent: "cashflow", plan: "cashflow.analyze",
      run: (s) => {
        const b = s.run!.board;
        const f = (o: Omit<FactOpts, "agent">) => b.facts.push(mkFact(s, { ...o, agent: "cashflow" }));
        f({ id: "cf_in_total", label: "Total încasări 2025", field: "inflow_total", value: "9.788.000", normalized: 9_788_000, doc: "extras", quote: "Total încasări 2025: 9.788.000" });
        f({ id: "cf_out_total", label: "Total plăți 2025", field: "outflow_total", value: "8.740.000", normalized: 8_740_000, doc: "extras", quote: "Total plăți 2025: 8.740.000" });
        f({ id: "cf_hanse", label: "Încasări Hanse Logistik GmbH", field: "client_inflow", value: "2.933.600", normalized: 2_933_600, doc: "extras", page: 2, quote: "Hanse Logistik GmbH: 2.933.600" });
        f({ id: "cf_labs_in", label: "Încasări de la Codeforge Labs SRL", field: "counterparty_inflow", value: "1.750.000", normalized: 1_750_000, doc: "extras", page: 2, quote: "Codeforge Labs SRL: încasări 1.750.000" });
        f({ id: "cf_labs_out", label: "Plăți către Codeforge Labs SRL", field: "counterparty_outflow", value: "1.600.000", normalized: 1_600_000, doc: "extras", page: 2, quote: "Plăți către Codeforge Labs SRL: 1.600.000" });
        b.cashflow = cashflowBoard(1);
        metric(b, "inflow_total", "Încasări totale 2025", 9_788_000, "RON", fmtRon(9_788_000), "cashflow", null, evOf(b, "cf_in_total"));
        metric(b, "operating_inflow", "Încasări operaționale 2025", 9_470_000, "RON", fmtRon(9_470_000), "cashflow", "Încasări totale − asociați (120.000) − financiar (198.000)", evOf(b, "cf_in_total"));
        metric(b, "turnover_gap_pct", "Abatere încasări operaționale vs. CA", 19.87, "%", fmtSignedPct(19.87), "cashflow", "(încasări operaționale − CA) / CA = (9.470.000 − 7.900.000) / 7.900.000", evOf(b, "cf_in_total", "fin_rev25"));
        pushStep(s, {
          agent: "cashflow", kind: "result", title: "Încasări 9.788.000 RON; operaționale 9.470.000 RON (+19,9% față de CA)", task: "cashflow.analyze", model: SMALL, ms: 1970, status: "warning",
          detail: { gap_pct: 19.9, tolerance_pct: POLICY.turnoverGapTolerancePct, top_counterparty: "Hanse Logistik GmbH" },
        });
        setAgent(s, "cashflow", "done", "Operaționale 9.470.000 RON (+19,9% față de CA)");
        setPlan(s, "cashflow.analyze", "done");
        spend(s, 3);
      },
    },
    {
      agent: "critic", plan: undefined,
      run: (s) => {
        const b = s.run!.board;
        b.facts.forEach((f) => { if (f.id === "cf_labs_in" || f.id === "cf_labs_out") f.conflict = true; });
        upsert(b.issues, {
          id: "ISS-CF-2", agent: "critic", severity: "warning", title: "Posibil flux intragrup cu Codeforge Labs SRL",
          detail: "Încasările operaționale depășesc cu 19,9% cifra de afaceri; contrapartida Codeforge Labs SRL are intrări 1.750.000 RON și ieșiri 1.600.000 RON.", refs: ["cf_labs_in", "cf_labs_out"], status: "open", resolution: null,
        });
        addPlan(s, { task: "cashflow.recheck", agent: "cashflow", why: "Re-verificare cerută de Critic: fără fluxurile intragrup.", status: "pending" }, "cashflow.analyze");
        setAgent(s, "cashflow", "stale", "Rezultat contestat de Critic");
        pushStep(s, {
          agent: "critic", kind: "challenge", title: "Contestare: Codeforge Labs SRL — intrări 1.750.000 RON și ieșiri 1.600.000 RON, posibil flux intragrup", task: "critic.challenge", model: LARGE, ms: 1380, status: "warning",
          thought: "Încasările operaționale depășesc cu 19,9% cifra de afaceri. O contrapartidă cu nume aproape identic cu al solicitantului și fluxuri aproape simetrice indică transfer intragrup, nu venit din vânzări.",
          detail: { asks: ["kyb.map", "cashflow.recheck"], counterparty: "Codeforge Labs SRL", inflow: 1_750_000, outflow: 1_600_000 },
        });
        spend(s, 2);
      },
    },
    {
      agent: "kyb", plan: "kyb.map",
      run: (s) => {
        const b = s.run!.board;
        const f = (o: Omit<FactOpts, "agent">) => b.facts.push(mkFact(s, { ...o, agent: "kyb" }));
        f({ id: "kyb_ana70", label: "Ana-Maria Georgescu — participație în Codeforge Digital", field: "ownership_pct", value: "70%", normalized: 70, doc: "onrc", quote: "Ana-Maria Georgescu — 70% din părțile sociale", entity: "person-ana" });
        f({ id: "kyb_radu30", label: "Radu Ionescu — participație în Codeforge Digital", field: "ownership_pct", value: "30%", normalized: 30, doc: "onrc", quote: "Radu Ionescu — 30% din părțile sociale", entity: "person-radu" });
        f({ id: "kyb_ana_labs", label: "Ana-Maria Georgescu — participație în Codeforge Labs SRL", field: "ownership_pct", value: "60%", normalized: 60, doc: "onrc", quote: "Ana-Maria Georgescu deține 60% din Codeforge Labs SRL", entity: "person-ana" });
        f({ id: "kyb_teodor", label: "Teodor Marin — participație în Codeforge Labs SRL", field: "ownership_pct", value: "40%", normalized: 40, doc: "onrc", quote: "Teodor Marin — 40% din Codeforge Labs SRL", entity: "person-teodor", verified: false, note: "Citatul nu a fost găsit literal în document; confirmați manual sau respingeți." });
        f({ id: "kyb_reg_date", label: "Data înmatriculării", field: "registration_date", value: "12.03.2019", doc: "onrc", quote: "12.03.2019" });
        f({ id: "kyb_extract_date", label: "Data eliberării certificatului constatator", field: "extract_date", value: "15.10.2026", doc: "onrc", quote: "15.10.2026" });
        f({ id: "kyb_id_expiry", label: "Expirare act de identitate (administrator)", field: "identity_expiry", value: "02.09.2031", doc: "id", quote: "02.09.2031", entity: "person-ana" });
        const nodes: GraphNode[] = [
          { id: "applicant", label: "Codeforge Digital SRL", type: "applicant", flags: ["SOLICITANT"], exposure: null },
          { id: "person-ana", label: "Ana-Maria Georgescu", type: "person", flags: ["BENEFICIAR REAL", "ADMINISTRATOR"], exposure: null },
          { id: "person-radu", label: "Radu Ionescu", type: "person", flags: ["BENEFICIAR REAL"], exposure: null },
          { id: "person-teodor", label: "Teodor Marin", type: "person", flags: ["NEVERIFICAT"], exposure: null },
          { id: "labs", label: "Codeforge Labs SRL", type: "company", flags: ["AFILIAT"], exposure: 800_000 },
        ];
        const edges: GraphEdge[] = [
          { source: "person-ana", target: "applicant", label: "70%", share_pct: 70 },
          { source: "person-radu", target: "applicant", label: "30%", share_pct: 30 },
          { source: "person-ana", target: "labs", label: "60%", share_pct: 60 },
          { source: "person-teodor", target: "labs", label: "40%", share_pct: 40 },
        ];
        b.kyb = {
          nodes, edges,
          ubo: [
            { name: "Ana-Maria Georgescu", share_pct: 70, via: "direct, în Codeforge Digital SRL" },
            { name: "Radu Ionescu", share_pct: 30, via: "direct, în Codeforge Digital SRL" },
          ],
          group_exposure: 800_000,
          sanctions_hits: 0,
          kyc_checks: [
            { rule_id: "VAL-01", outcome: "PASS", detail: "Actul de identitate al administratorului este valabil până la 02.09.2031." },
            { rule_id: "BUS-05", outcome: "PASS", detail: "Certificatul constatator are 13 zile (limită 90)." },
            { rule_id: "BUS-02", outcome: "PASS", detail: "Cotele asociaților însumează 100%." },
            { rule_id: "BUS-04", outcome: "WARN", detail: "Beneficiar real comun cu o entitate afiliată: Codeforge Labs SRL (60%)." },
            { rule_id: "EXT-01", outcome: "PASS", detail: "Fără potriviri în listele sintetice de sancțiuni / PEP." },
          ],
        };
        metric(b, "group_exposure", "Expunere de grup existentă", 800_000, "RON", fmtRon(800_000), "kyb", "Facilități active ale Codeforge Labs SRL", evOf(b, "kyb_ana_labs"));
        s.profile.existingGroup = 800_000;
        upsert(b.issues, {
          id: "ISS-CF-2", agent: "critic", severity: "warning", title: "Posibil flux intragrup cu Codeforge Labs SRL",
          detail: "Afiliere confirmată de KYB: Ana-Maria Georgescu deține 60% din Codeforge Labs SRL.", refs: ["cf_labs_in", "cf_labs_out", "kyb_ana_labs"], status: "resolved",
          resolution: "Entitate afiliată (60% Ana-Maria Georgescu); fluxurile se reclasifică drept intragrup.",
        });
        upsert(b.issues, {
          id: "ISS-CF-3", agent: "critic", severity: "info", title: "Reclasificarea fluxurilor intragrup cere confirmarea analistului",
          detail: "Intrările de 1.750.000 RON și ieșirile de 1.600.000 RON sunt tratate ca intragrup. Confirmați în Revizie.", refs: ["cf_labs_in", "cf_labs_out"], status: "open", resolution: null,
        });
        pushStep(s, {
          agent: "kyb", kind: "result", title: "Codeforge Labs SRL este afiliată prin Ana-Maria Georgescu (60%); expunere de grup 800.000 RON", task: "kyb.map", model: SMALL, ms: 2650, status: "warning",
          detail: { affiliates: ["Codeforge Labs SRL"], shared_ubo: "Ana-Maria Georgescu", group_exposure: 800_000, sanctions_hits: 0, unverified_quotes: 1 },
        });
        setAgent(s, "kyb", "done", "1 entitate afiliată; expunere de grup 800.000 RON");
        setPlan(s, "kyb.map", "done");
        spend(s, 3);
      },
    },
    {
      agent: "cashflow", plan: "cashflow.recheck",
      run: (s) => {
        const b = s.run!.board;
        b.cashflow = cashflowBoard(2);
        s.extra.topClientName = "Hanse Logistik GmbH";
        s.extra.topClientPct = 38;
        s.extra.turnoverGapPct = -2.28;
        metric(b, "operating_inflow", "Încasări operaționale 2025", 7_720_000, "RON", fmtRon(7_720_000), "cashflow", "Încasări totale − intragrup (1.750.000) − asociați (120.000) − financiar (198.000)", evOf(b, "cf_in_total", "cf_labs_in"));
        metric(b, "turnover_gap_pct", "Abatere încasări operaționale vs. CA", -2.28, "%", fmtSignedPct(-2.28), "cashflow", "(7.720.000 − 7.900.000) / 7.900.000", evOf(b, "cf_in_total", "fin_rev25"));
        metric(b, "top_client_share", "Cel mai mare client (Hanse Logistik GmbH)", 38, "%", fmtPct(38, 0), "cashflow", "2.933.600 / 7.720.000", evOf(b, "cf_hanse"));
        pushStep(s, {
          agent: "cashflow", kind: "result", title: "Re-calcul fără fluxuri intragrup: operaționale 7.720.000 RON (−2,3% față de CA, în toleranță) · Hanse Logistik 38%", task: "cashflow.analyze", model: SMALL, ms: 1820,
          detail: { rerun: 2, gap_pct: -2.3, tolerance_pct: POLICY.turnoverGapTolerancePct, top_client: { name: "Hanse Logistik GmbH", share_pct: 38 } },
        });
        setAgent(s, "cashflow", "done", "Operaționale 7.720.000 RON (−2,3% față de CA)");
        setPlan(s, "cashflow.recheck", "done");
        spend(s, 3);
      },
    },
    {
      agent: "completeness", plan: "completeness.request",
      run: (s) => {
        const run = s.run!;
        const req: ClientRequest = {
          id: `req-${s.id.replace("credit-", "")}-1`, round: 1, status: "SENT", channel: "Portal client (simulat)",
          message: `Bună ziua, pentru a continua analiza cererii de finanțare de ${fmtRon(s.profile.requested.amount)} avem nevoie de 2 documente. Le puteți încărca direct în portal; restul dosarului este în lucru.`,
          items: [
            { code: "fs_previous", title: "Situații financiare pentru exercițiul 2024", reason: "Calculăm evoluția cifrei de afaceri și a EBITDA; politica cere două exerciții financiare încheiate.", refs: ["ISS-CMP-1"], satisfied: false },
            { code: "collateral_valuation", title: "Raport de evaluare pentru imobilul achiziționat", reason: `Garanția este ipotecă imobiliară; avem nevoie de valoarea de piață pentru LTV (maximum ${POLICY.ltvMaxPct}%).`, refs: ["ISS-CMP-1"], satisfied: false },
          ],
          sent_at: new Date().toISOString(), answered_at: null,
        };
        run.requests.push(req);
        const issue = run.board.issues.find((i) => i.id === "ISS-CMP-1");
        if (issue) issue.status = "requested";
        pushStep(s, {
          agent: "completeness", kind: "request", title: "O cerere consolidată către client: 2 documente", task: "completeness.request", model: SMALL, ms: 740, status: "info",
          thought: "Grupez toate lipsurile într-o singură cerere, ca să nu pierd timp cu mai multe runde cu clientul.",
          detail: { request_id: req.id, items: ["fs_previous", "collateral_valuation"], round: 1, channel: req.channel },
        });
        setAgent(s, "completeness", "done", "Cerere consolidată trimisă (2 documente)");
        setPlan(s, "completeness.request", "done");
        setAgent(s, "client", "running", "Așteaptă răspunsul clientului", true);
        setAgent(s, "analyst", "idle", "În așteptarea clientului");
        run.status = "WAITING_CLIENT";
        spend(s, 1);
      },
    },
  ];
  return turns;
}

function codeforgePhase2(): Turn[] {
  return [
    {
      agent: "completeness", plan: "completeness.verify",
      run: (s) => {
        s.extra.docsComplete = true;
        const issue = s.run!.board.issues.find((i) => i.id === "ISS-CMP-1");
        if (issue) { issue.status = "resolved"; issue.resolution = "Documente primite în portal; dosar complet 7/7."; }
        pushStep(s, {
          agent: "completeness", kind: "result", title: "Dosar complet: 7/7 documente obligatorii", task: "completeness.verify", model: SMALL, ms: 880,
          detail: { present: 7, required: 7, new_documents: ["fs_previous", "collateral_valuation"] },
        });
        setAgent(s, "completeness", "done", "Dosar complet 7/7");
        setPlan(s, "completeness.verify", "done");
        setAgent(s, "analyst", "running");
        spend(s, 2);
      },
    },
    {
      agent: "guard",
      run: (s) => {
        const doc = docOf(s, "evaluare");
        s.run!.board.security.injections.push({ document_id: doc.id, filename: doc.filename, quote: CF.injection });
        upsert(s.run!.board.issues, {
          id: "ISS-GRD-1", agent: "guard", severity: "warning", title: "Instrucțiune injectată în raportul de evaluare",
          detail: "Documentul conține text adresat asistentului AI. A fost ignorat și raportat; nu influențează analiza.", refs: [doc.id], status: "resolved", resolution: "Linia a fost exclusă din context.",
        });
        pushStep(s, {
          agent: "guard", kind: "event", title: "Instrucțiune ignorată în raportul de evaluare", task: "guard.scan_document", ms: 120, status: "warning",
          thought: "Textul din documente este date, nu comenzi: linia a fost exclusă din contextul modelului și raportată.",
          detail: { document_id: doc.id, filename: doc.filename, page: 2, quote: CF.injection },
        });
        setAgent(s, "guard", "done", "1 instrucțiune ignorată");
        spend(s, 1);
      },
    },
    {
      agent: "financials", plan: "financials.extract",
      run: (s) => {
        const b = s.run!.board;
        const f = (o: Omit<FactOpts, "agent">) => b.facts.push(mkFact(s, { ...o, agent: "financials" }));
        f({ id: "fin_rev24", label: "Cifra de afaceri 2024", field: "revenue_2024", value: "6.300.000", normalized: 6_300_000, doc: "sit2024", quote: "Cifra de afaceri netă: 6.300.000" });
        f({ id: "fin_dep24", label: "Cheltuieli cu amortizarea 2024", field: "depreciation_2024", value: "140.000", normalized: 140_000, doc: "sit2024", quote: "Cheltuieli cu amortizarea: 140.000" });
        f({ id: "fin_ebit24", label: "Rezultat din exploatare 2024", field: "operating_profit_2024", value: "1.020.000", normalized: 1_020_000, doc: "sit2024", quote: "Rezultat din exploatare: 1.020.000" });
        f({ id: "fin_net24", label: "Rezultat net 2024", field: "net_profit_2024", value: "780.000", normalized: 780_000, doc: "sit2024", quote: "Rezultat net al exercițiului: 780.000" });
        f({ id: "val_mkt", label: "Valoarea de piață a imobilului", field: "collateral_value", value: "5.200.000 RON", normalized: 5_200_000, doc: "evaluare", quote: "Valoarea de piață: 5.200.000 RON" });
        b.financials!.years.push({ year: 2024, items: { revenue: 6_300_000, depreciation: 140_000, operating_profit: 1_020_000, ebitda: 1_160_000, net_profit: 780_000 } });
        b.financials!.years.sort((a, c) => c.year - a.year);
        s.extra.revenueGrowthPct = 25.4;
        s.profile.collateral = 5_200_000;
        metric(b, "revenue_2024", "Cifra de afaceri 2024", 6_300_000, "RON", fmtRon(6_300_000), "financials", null, evOf(b, "fin_rev24"));
        metric(b, "revenue_growth", "Creșterea cifrei de afaceri 2025 / 2024", 25.4, "%", fmtSignedPct(25.4), "financials", "(7.900.000 − 6.300.000) / 6.300.000", evOf(b, "fin_rev25", "fin_rev24"), { sector: "J", p25: 6, median: 14, p75: 27, percentile: 72 });
        metric(b, "collateral_value", "Valoarea de piață a garanției", 5_200_000, "RON", fmtRon(5_200_000), "financials", null, evOf(b, "val_mkt"));
        pushStep(s, {
          agent: "financials", kind: "result", title: "Situații 2024 și evaluare: CA 2024 6.300.000 RON (+25,4% în 2025) · imobil 5.200.000 RON", task: "financials.extract", model: SMALL, ms: 1760,
          detail: { facts: 5, verified: 5, growth_pct: 25.4, collateral_value: 5_200_000 },
        });
        setAgent(s, "financials", "done", "CA 2024 6.300.000 RON; +25,4% în 2025", true);
        spend(s, 3);
      },
    },
    {
      agent: "analyst", plan: "analyst.assess",
      run: (s) => {
        const b = s.run!.board;
        const precedents: Precedent[] = [
          { id: "PR-2022-0417", sector: "J", year: 2022, amount: 3_200_000, dscr: 1.31, net_debt_ebitda: 2.4, decision: "APPROVE", outcome_24m: "performing", similarity: 0.91 },
          { id: "PR-2023-0088", sector: "J", year: 2023, amount: 4_100_000, dscr: 1.12, net_debt_ebitda: 3.1, decision: "MODIFY", outcome_24m: "late", similarity: 0.88 },
          { id: "PR-2021-0231", sector: "J", year: 2021, amount: 2_800_000, dscr: 1.45, net_debt_ebitda: 1.9, decision: "APPROVE", outcome_24m: "performing", similarity: 0.86 },
          { id: "PR-2024-0102", sector: "J", year: 2024, amount: 3_900_000, dscr: 1.07, net_debt_ebitda: 3.3, decision: "DECLINE", outcome_24m: null, similarity: 0.84 },
          { id: "PR-2022-0563", sector: "J", year: 2022, amount: 3_600_000, dscr: 1.22, net_debt_ebitda: 2.8, decision: "MODIFY", outcome_24m: "default", similarity: 0.8 },
        ];
        const req = evalTerms(s.profile, s.profile.requested.amount, s.profile.requested.term_months, latestIndex().value_pct);
        const benchmarks: Benchmark[] = [
          { metric: "ebitda_margin", label: "Marjă EBITDA", sector: "J", p25: 14, median: 19, p75: 26, value: 20.1, percentile: 56 },
          { metric: "revenue_growth", label: "Creștere cifră de afaceri", sector: "J", p25: 6, median: 14, p75: 27, value: 25.4, percentile: 72 },
          { metric: "dscr", label: "DSCR la suma cerută", sector: "J", p25: 1.25, median: 1.55, p75: 2.05, value: round(req.dscr, 2), percentile: 8 },
          { metric: "net_debt_ebitda", label: "Datorie netă / EBITDA (după creditare)", sector: "J", p25: 0.8, median: 1.7, p75: 2.6, value: round(req.ndEbitda, 2), percentile: 82 },
        ];
        const known = precedents.filter((p) => p.outcome_24m !== null && p.decision !== "DECLINE");
        const defaults = known.filter((p) => p.outcome_24m === "default").length;
        const ci = wilson(defaults, known.length);
        b.analyst = {
          risk_class: "B",
          summary: "Sector J (IT & comunicații): marja EBITDA 20,1% e peste mediana sectorului (19%), dar DSCR-ul la suma cerută (1,09x) e sub primul cuartil (1,25x). Dintre cele 5 precedente asemănătoare, două au fost aprobate integral, două modificate (unul ajuns în restanță, unul în default) și unul respins. Eșantion mic: intervalul de încredere este larg, deci statistica orientează, nu decide.",
          benchmarks, precedents,
          neighbors: { n: precedents.length, approved_pct: 80, default_rate_pct: round((defaults / known.length) * 100, 1), ci_low_pct: ci.low, ci_high_pct: ci.high },
        };
        pushStep(s, {
          agent: "analyst", kind: "result", title: "Sector J: 5 precedente similare, interval de încredere larg · clasa de risc B", task: "analyst.assess", model: LARGE, ms: 2480,
          thought: "Cinci cazuri nu sunt un eșantion; folosesc statistica doar ca reper pentru marjă și grad de îndatorare, nu ca justificare.",
          detail: { risk_class: "B", neighbors: 5, with_outcome: known.length, default_rate_ci_pct: [ci.low, ci.high] },
        });
        setAgent(s, "analyst", "running", "Clasa de risc B; 5 precedente");
        setPlan(s, "analyst.assess", "done");
        spend(s, 3);
      },
    },
    {
      agent: "policy", plan: "policy.evaluate",
      run: (s) => {
        const rec = applyPolicyToBoard(s);
        s.run!.recommendation = rec;
        const p = rec.proposed;
        const req = evalTerms(s.profile, s.profile.requested.amount, s.profile.requested.term_months, rec.market.value_pct);
        pushStep(s, {
          agent: "policy", kind: "result", task: "policy.evaluate", model: null, ms: 140, status: "warning",
          title: `${rec.market.index} ${fmtPct(rec.market.value_pct, 2)} + marjă ${fmtNum(POLICY.margins[s.profile.riskClass])} = ${fmtPct(req.rate, 2)} · DSCR ${fmtX(req.dscr)} < ${fmtNum(POLICY.dscrMin)} · LTV ${fmtPct(req.ltv ?? 0)} > ${POLICY.ltvMaxPct}% → ${p ? `contraofertă ${fmtRon(p.amount)}, rată ${fmtRon(p.monthly_payment)}/lună` : "respingere"}`,
          detail: { policy_version: POLICY.version, rules_failed: s.run!.board.rules.filter((r) => r.outcome === "FAIL").map((r) => r.rule_id), level: rec.level, proposed: p },
        });
        setAgent(s, "policy", "done", p ? `Contraofertă ${fmtRon(p.amount)}; nivel ${rec.level}` : "Respingere");
        setPlan(s, "policy.evaluate", "done");
        spend(s, 1);
      },
    },
    {
      agent: "memo", plan: "memo.draft",
      run: (s) => {
        const run = s.run!;
        run.board.memo = memoFor(s, run.recommendation!);
        pushStep(s, {
          agent: "memo", kind: "result", title: `Nota de credit redactată: ${run.board.memo.verified_numbers} cifre verificate, 0 neverificate`, task: "memo.draft", model: LARGE, ms: 3120,
          thought: "Fiecare cifră din notă trebuie să existe ca indicator cu sursă; ce nu pot lega de o sursă nu intră în text.",
          detail: { verified_numbers: run.board.memo.verified_numbers, unverified: [] },
        });
        setAgent(s, "memo", "done", `${run.board.memo.verified_numbers} cifre verificate`);
        setPlan(s, "memo.draft", "done");
        spend(s, 3);
      },
    },
    {
      agent: "critic", plan: "critic.review",
      run: (s) => {
        const run = s.run!;
        pushStep(s, {
          agent: "critic", kind: "result", title: "Verificare finală: fără contradicții între memo, indicatori și surse", task: "critic.review", model: LARGE, ms: 1540,
          thought: "Am recalculat DSCR și LTV independent și am comparat cifrele din notă cu indicatorii. Rămâne o confirmare umană: reclasificarea fluxurilor intragrup.",
          detail: { checked_numbers: run.board.memo?.verified_numbers ?? 0, open_for_human: ["ISS-CF-3"] },
        });
        setAgent(s, "critic", "done", "Fără contradicții deschise", true);
        setPlan(s, "critic.review", "done");
        setAgent(s, "analyst", "done", "Dosar pregătit pentru decizie");
        setAgent(s, "human", "running", "Așteaptă decizia");
        run.status = "AWAITING_DECISION";
        spend(s, 2);
      },
    },
  ];
}

// ------------------------------------------------------------------ prefab cases (Nordic, Transport)

function seedNordic(st: CaseState) {
  const run = newRun(st, "credit_analyst", 60 * 25);
  st.run = run;
  run.plan = [
    { task: "completeness.check", agent: "completeness", why: "Verifică documentele și coerența identității solicitantului.", status: "done" },
    { task: "financials.extract", agent: "financials", why: "Extrage situațiile financiare 2025.", status: "pending" },
    { task: "kyb.map", agent: "kyb", why: "Mapează asociații și entitățile afiliate.", status: "pending" },
    { task: "policy.evaluate", agent: "policy", why: `Verifică față de normele ${POLICY.version}.`, status: "pending" },
    { task: "critic.review", agent: "critic", why: "Contestă concluziile înainte de decizia umană.", status: "pending" },
  ];
  const t = (m: number) => iso(60 * 25 - m);
  pushStep(st, { agent: "orchestrator", kind: "plan", title: "Plan de lucru: 5 sarcini", task: "orchestrator.plan", model: LARGE, ms: 1620, at: t(1), thought: "Cerere depusă la sucursală (scan). Verific mai întâi coerența identității.", detail: { tasks: 5 } });
  pushStep(st, { agent: "analyst", kind: "dispatch", title: "Analistul financiar delegă verificarea completitudinii", task: "analyst.dispatch", model: LARGE, ms: 880, at: t(2), detail: {} });
  const b = run.board;
  b.facts.push(
    mkFact(st, { id: "cui_app", agent: "completeness", label: "CUI din cererea de finanțare", field: "company_identifier", value: "41562093", doc: "cerere", quote: "41562093", conflict: true, note: "Diferă de CUI-ul din certificatul constatator." }),
    mkFact(st, { id: "cui_onrc", agent: "completeness", label: "CUI din certificatul ONRC", field: "company_identifier", value: "41562039", doc: "onrc", quote: "41562039", conflict: true, note: "Diferă de CUI-ul din cerere (două cifre inversate?)." }),
  );
  upsert(b.issues, { id: "ISS-CMP-1", agent: "completeness", severity: "blocking", title: "CUI diferit între cerere și ONRC", detail: "Cererea indică 41562093, certificatul ONRC indică 41562039. Societatea nu poate fi identificată fără clarificare.", refs: ["cui_app", "cui_onrc"], status: "requested", resolution: null });
  pushStep(st, { agent: "completeness", kind: "result", title: "CUI diferit: cerere 41562093 ≠ certificat ONRC 41562039", task: "completeness.check", model: SMALL, ms: 1090, status: "warning", at: t(3), detail: { cui_application: "41562093", cui_onrc: "41562039" } });
  pushStep(st, { agent: "critic", kind: "challenge", title: "Contestare: nu pot valida KYB și fluxurile pe un CUI neconfirmat", task: "critic.challenge", model: LARGE, ms: 1210, status: "warning", at: t(4), thought: "Orice cifră atașată unui CUI greșit ar aparține altei societăți. Opresc analiza și cer clarificare.", detail: { blocks: ["kyb.map", "financials.extract", "policy.evaluate"] } });
  const req: ClientRequest = {
    id: "req-nordic-1", round: 1, status: "SENT", channel: "Portal client (simulat)",
    message: "Bună ziua, am observat o diferență între CUI-ul din cerere și cel din certificatul constatator. Vă rugăm să confirmați CUI-ul corect.",
    items: [{ code: "clarify_cui", title: "Confirmați codul unic de înregistrare (CUI)", reason: "Cererea indică 41562093, certificatul ONRC indică 41562039. Fără confirmare nu putem identifica societatea.", refs: ["cui_app", "cui_onrc"], satisfied: false }],
    sent_at: t(5), answered_at: null,
  };
  run.requests.push(req);
  pushStep(st, { agent: "completeness", kind: "request", title: "Cerere de clarificare către client: confirmați CUI-ul", task: "completeness.request", model: SMALL, ms: 640, status: "info", at: t(6), detail: { request_id: req.id, items: ["clarify_cui"], round: 1 } });
  const lvl = levelFor(st.profile.requested.amount);
  run.recommendation = {
    decision: "NEEDS_INFORMATION",
    requested: { ...st.profile.requested },
    proposed: null,
    reasons: [{ code: "CON-02", text: "CUI diferit între cerere (41562093) și certificatul ONRC (41562039)", refs: ["cui_app", "cui_onrc"] }],
    conditions: [],
    level: lvl,
    level_reason: `Nivel provizoriu: ${levelReason(lvl, 0, st.profile.requested.amount)}`,
    policy_version: POLICY.version,
    market: { index: POLICY.index, value_pct: 5.8, as_of: "2026-10-27", source: MARKET_SOURCE },
    superseded: false,
  };
  b.rules = [{ rule_id: "CON-02", title: "CUI cerere = CUI ONRC", outcome: "FAIL", detail: "Cele două documente indică CUI diferit.", value: "41562093 ≠ 41562039", threshold: "identic", metric_refs: [] }];
  for (const id of ["orchestrator", "analyst", "completeness", "critic"] as AgentId[]) setAgent(st, id, "done", undefined, true);
  setAgent(st, "completeness", "done", "Cerere de clarificare trimisă");
  setAgent(st, "critic", "done", "Analiză oprită până la clarificare");
  setAgent(st, "analyst", "idle", "În așteptarea clientului");
  setAgent(st, "client", "running", "Așteaptă confirmarea CUI", true);
  run.budget = { used: 9, limit: BUDGET.limit, deadline_s: BUDGET.deadline_s, elapsed_s: 5.4 };
  run.status = "WAITING_CLIENT";
  run.updated_at = t(6);
}

function nordicPhase2(): Turn[] {
  return [
    {
      agent: "completeness", plan: "completeness.check",
      run: (s) => {
        const b = s.run!.board;
        b.facts.forEach((f) => { if (f.id === "cui_app" || f.id === "cui_onrc") f.conflict = false; });
        const app = b.facts.find((f) => f.id === "cui_app");
        if (app) { app.review = "corrected"; app.value = "41562039"; app.note = "Corectat după confirmarea clientului în portal."; }
        const issue = b.issues.find((i) => i.id === "ISS-CMP-1");
        if (issue) { issue.status = "resolved"; issue.resolution = "Clientul a confirmat CUI 41562039; cererea a fost corectată."; }
        b.rules = b.rules.filter((r) => r.rule_id !== "CON-02");
        s.cui = "41562039";
        pushStep(s, { agent: "completeness", kind: "result", title: "Identitate confirmată: CUI 41562039 (cererea a fost corectată)", task: "completeness.check", model: SMALL, ms: 760, detail: { cui: "41562039" } });
        setAgent(s, "completeness", "done", "CUI confirmat 41562039");
        setAgent(s, "analyst", "running");
        spend(s, 2);
      },
    },
    {
      agent: "policy", plan: "policy.evaluate",
      run: (s) => {
        const b = s.run!.board;
        const rec = applyPolicyToBoard(s);
        s.run!.recommendation = rec;
        const p = rec.proposed;
        pushStep(s, {
          agent: "policy", kind: "result", task: "policy.evaluate", model: null, ms: 130, status: p ? "warning" : "ok",
          title: p ? `DSCR sub prag la suma cerută → contraofertă ${fmtRon(p.amount)} pe ${p.term_months} luni` : "Respingere pe criterii de politică",
          detail: { policy_version: POLICY.version, level: rec.level, rules_failed: b.rules.filter((r) => r.outcome === "FAIL").map((r) => r.rule_id) },
        });
        setAgent(s, "policy", "done", p ? `Contraofertă ${fmtRon(p.amount)}` : "Respingere");
        setPlan(s, "policy.evaluate", "done");
        spend(s, 1);
      },
    },
    {
      agent: "critic", plan: "critic.review",
      run: (s) => {
        pushStep(s, { agent: "critic", kind: "result", title: "Verificare finală: concluzia respectă pragurile de politică", task: "critic.review", model: LARGE, ms: 1180, detail: {} });
        setAgent(s, "critic", "done", "Fără contradicții deschise", true);
        setAgent(s, "analyst", "done", "Dosar pregătit pentru decizie");
        setAgent(s, "human", "running", "Așteaptă decizia");
        s.run!.status = "AWAITING_DECISION";
        spend(s, 2);
      },
    },
  ];
}

function seedTransport(st: CaseState) {
  const run = newRun(st, "analyst", 60 * 49);
  st.run = run;
  const t = (m: number) => iso(60 * 49 - m);
  run.plan = [
    { task: "completeness.check", agent: "completeness", why: "Set redus de documente pentru cereri sub 500.000 RON.", status: "done" },
    { task: "kyb.map", agent: "kyb", why: "Verifică Biroul de Credit și structura de proprietate.", status: "done" },
    { task: "policy.evaluate", agent: "policy", why: `Verifică față de normele ${POLICY.version}.`, status: "done" },
    { task: "memo.draft", agent: "memo", why: "Redactează nota de credit.", status: "done" },
    { task: "critic.review", agent: "critic", why: "Contestă concluziile înainte de decizia umană.", status: "done" },
  ];
  const b = run.board;
  pushStep(st, { agent: "orchestrator", kind: "plan", title: "Plan de lucru: 5 sarcini (set redus)", task: "orchestrator.plan", model: LARGE, ms: 1480, at: t(1), thought: "Sumă sub 500.000 RON: nivel L1 și set redus de documente.", detail: { tasks: 5 } });
  pushStep(st, { agent: "completeness", kind: "result", title: "Dosar complet pentru setul redus: 3/3 documente", task: "completeness.check", model: SMALL, ms: 940, at: t(2), detail: { present: 3, required: 3 } });
  b.facts.push(
    mkFact(st, { id: "bureau_dpd", agent: "kyb", label: "Restanță la Biroul de Credit", field: "bureau_dpd", value: "95 zile", normalized: 95, doc: "birou", quote: "Restanță curentă: 95 zile" }),
    mkFact(st, { id: "fin_rev25", agent: "financials", label: "Cifra de afaceri 2025", field: "revenue_2025", value: "2.480.000", normalized: 2_480_000, doc: "sit2025", quote: "Cifra de afaceri netă: 2.480.000" }),
    mkFact(st, { id: "fin_ebit25", agent: "financials", label: "Rezultat din exploatare 2025", field: "operating_profit_2025", value: "205.000", normalized: 205_000, doc: "sit2025", quote: "Rezultat din exploatare: 205.000" }),
    mkFact(st, { id: "fin_dep25", agent: "financials", label: "Cheltuieli cu amortizarea 2025", field: "depreciation_2025", value: "190.000", normalized: 190_000, doc: "sit2025", quote: "Cheltuieli cu amortizarea: 190.000" }),
  );
  metric(b, "revenue_2025", "Cifra de afaceri 2025", 2_480_000, "RON", fmtRon(2_480_000), "financials", null, evOf(b, "fin_rev25"));
  metric(b, "ebitda_2025", "EBITDA 2025", 395_000, "RON", fmtRon(395_000), "financials", "205.000 + 190.000", evOf(b, "fin_ebit25", "fin_dep25"));
  b.kyb = {
    nodes: [
      { id: "applicant", label: "Transport Rapid Dunărea SRL", type: "applicant", flags: ["SOLICITANT"], exposure: null },
      { id: "person-ion", label: "Ion Stănescu", type: "person", flags: ["BENEFICIAR REAL", "ADMINISTRATOR"], exposure: null },
    ],
    edges: [{ source: "person-ion", target: "applicant", label: "100%", share_pct: 100 }],
    ubo: [{ name: "Ion Stănescu", share_pct: 100, via: "direct" }],
    group_exposure: 0, sanctions_hits: 0,
    kyc_checks: [
      { rule_id: "BUS-02", outcome: "PASS", detail: "Asociat unic, 100%." },
      { rule_id: "EXT-01", outcome: "PASS", detail: "Fără potriviri în listele sintetice de sancțiuni / PEP." },
    ],
  };
  pushStep(st, { agent: "kyb", kind: "result", title: "Restanță de 95 de zile la Biroul de Credit (prag eliminatoriu: 90 de zile)", task: "kyb.map", model: SMALL, ms: 1730, status: "warning", at: t(3), detail: { bureau_dpd: 95, knockout_days: 90 } });
  const rec = applyPolicyToBoard(st);
  run.recommendation = rec;
  pushStep(st, { agent: "policy", kind: "result", title: "CR-06 eliminatoriu (restanță 95 zile ≥ 90) → recomandare de respingere", task: "policy.evaluate", model: null, ms: 110, status: "warning", at: t(4), detail: { policy_version: POLICY.version, knockout: "CR-06", level: rec.level } });
  run.board.memo = memoFor(st, rec);
  pushStep(st, { agent: "memo", kind: "result", title: `Nota de credit redactată: ${run.board.memo.verified_numbers} cifre verificate, 0 neverificate`, task: "memo.draft", model: LARGE, ms: 2210, at: t(5), detail: {} });
  pushStep(st, { agent: "critic", kind: "result", title: "Verificare finală: concluzia decurge din criteriul eliminatoriu", task: "critic.review", model: LARGE, ms: 1010, at: t(6), detail: {} });
  for (const id of ["orchestrator", "analyst", "completeness", "financials", "kyb", "policy", "memo", "critic"] as AgentId[]) setAgent(st, id, "done", undefined, true);
  setAgent(st, "kyb", "done", "Restanță 95 de zile");
  setAgent(st, "policy", "done", "Respingere (eliminatoriu CR-06)");
  setAgent(st, "human", "running", "Așteaptă decizia");
  run.budget = { used: 12, limit: BUDGET.limit, deadline_s: BUDGET.deadline_s, elapsed_s: 9.7 };
  run.status = "AWAITING_DECISION";
  run.updated_at = t(6);
}

// ------------------------------------------------------------------ re-evaluation after a market change

function reevaluate(st: CaseState, indexPct: number): "changed" | "unchanged" | "skipped" {
  const run = st.run;
  if (!run || !run.recommendation || run.status === "DECIDED" || run.status === "RUNNING" || run.status === "WAITING_CLIENT") return "skipped";
  const before = run.recommendation;
  const rec = applyPolicyToBoard(st);
  const changed = (rec.proposed?.amount ?? 0) !== (before.proposed?.amount ?? 0) || rec.decision !== before.decision;
  run.recommendation = rec;
  if (run.board.memo) run.board.memo = memoFor(st, rec);
  const reqE = evalTerms(st.profile, st.profile.requested.amount, st.profile.requested.term_months, indexPct);
  pushStep(st, {
    agent: "orchestrator", kind: "event", title: `Fixing nou ${POLICY.index} ${fmtPct(indexPct, 2)}: dosarul este reevaluat`, task: "orchestrator.reevaluate", ms: null, status: "info",
    detail: { index: POLICY.index, value_pct: indexPct, policy_version: POLICY.version },
  });
  pushStep(st, {
    agent: "policy", kind: "result", task: "policy.evaluate", model: null, ms: 95, status: changed ? "warning" : "ok",
    title: before.proposed && rec.proposed
      ? `Reevaluare la ${fmtPct(reqE.rate, 2)}: contraofertă ${fmtRon(before.proposed.amount)} → ${fmtRon(rec.proposed.amount)}`
      : `Reevaluare la ${fmtPct(reqE.rate, 2)}: recomandare neschimbată (${rec.decision === "DECLINE" ? "criteriu eliminatoriu" : "fără modificări"})`,
    detail: { before: before.proposed, after: rec.proposed, policy_version: POLICY.version },
  });
  if (run.board.memo) pushStep(st, { agent: "memo", kind: "result", title: "Nota de credit actualizată cu noile cifre", task: "memo.draft", model: LARGE, ms: 1930, detail: { verified_numbers: run.board.memo.verified_numbers } });
  setAgent(st, "policy", "done", rec.proposed ? `Contraofertă ${fmtRon(rec.proposed.amount)}` : "Respingere", true);
  spend(st, 2);
  return changed ? "changed" : "unchanged";
}

// ------------------------------------------------------------------ decisions

function letterFor(st: CaseState, d: Omit<Decision, "letter">): string {
  const head = `[PROIECT DE SCRISOARE — nu a fost trimis. Trimiterea către client rămâne o acțiune umană.]\n\nCătre: ${st.company} (CUI ${st.cui})\nReferitor: cererea de finanțare — ${st.profile.requested.product}\n\n`;
  if (d.action === "REJECT") {
    return `${head}Stimată clientă, stimate client,\n\nÎn urma analizei cererii dumneavoastră de ${fmtRon(st.profile.requested.amount)}, banca nu poate acorda finanțarea solicitată.\n\nMotiv: ${d.reason ?? st.run?.recommendation?.reasons[0]?.text ?? "nerespectarea criteriilor de creditare"}.\n\nPuteți depune o nouă cerere după remedierea situației. Rămânem la dispoziție pentru clarificări.\n\nCu stimă,\nEchipa de creditare`;
  }
  const t = d.terms;
  const lines = t
    ? `• Suma: ${fmtRon(t.amount)}\n• Durata: ${t.term_months} luni\n• Dobânda: ${fmtPct(t.rate_pct, 2)} (${t.index} ${fmtPct(t.index_value_pct, 2)} + marjă ${fmtNum(t.margin_pct)} p.p.)\n• Rata lunară estimată: ${fmtRon(t.monthly_payment)}`
    : "";
  const conds = d.conditions.length ? `\n\nCondiții:\n${d.conditions.map((c) => `• ${c}`).join("\n")}` : "";
  return `${head}Stimată clientă, stimate client,\n\nÎn urma analizei cererii dumneavoastră de ${fmtRon(st.profile.requested.amount)}, vă propunem următoarele condiții de finanțare:\n\n${lines}${conds}\n\nOferta este valabilă 30 de zile și poate fi acceptată în portalul clientului.\n\nCu stimă,\nEchipa de creditare`;
}

const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * p)]!;
};

// ------------------------------------------------------------------ public mock API

const summaryOf = (st: CaseState): CreditCaseSummary => {
  const run = st.run;
  const rec = run?.recommendation ?? null;
  let waiting: CreditCaseSummary["waiting_for"] = "analyst";
  let routing = "Agenții nu au pornit: pornește analiza pentru a pregăti dosarul.";
  if (run) {
    const last = run.steps[run.steps.length - 1];
    if (run.status === "RUNNING") { waiting = null; routing = `Agenții lucrează${last ? `: ${last.title}` : "…"}`; }
    else if (run.status === "WAITING_CLIENT") {
      const req = run.requests[run.requests.length - 1];
      waiting = "client";
      routing = `Cerere consolidată trimisă clientului (${req?.items.length ?? 0} ${req?.items.length === 1 ? "element" : "elemente"}); analiza se reia automat la răspuns.`;
    } else if (run.status === "AWAITING_DECISION") {
      waiting = rec ? (({ L1: "credit_analyst", L2: "risk_officer", L3: "credit_committee" }) as Record<Level, CreditRole>)[rec.level] : "analyst";
      routing = rec?.level_reason ?? "Așteaptă decizia analistului.";
    } else if (run.status === "DECIDED") { waiting = null; routing = `Decis: ${run.decision?.votes[0]?.username ?? "analist"}.`; }
    else { waiting = "analyst"; routing = "Rularea a eșuat; reîncercați."; }
  }
  return {
    id: st.id,
    title: st.title,
    company: st.company,
    cui: st.cui,
    amount: st.profile.requested.amount,
    term_months: st.profile.requested.term_months,
    product: st.profile.requested.product,
    channel: st.channel,
    created_at: st.created_at,
    run: run
      ? { id: run.id, status: run.status, level: rec?.level ?? null, recommendation: rec?.decision ?? null, updated_at: run.updated_at, last_step: run.steps[run.steps.length - 1]?.title ?? null }
      : null,
    waiting_for: waiting,
    routing_reason: routing,
  };
};

const RED_TEAM = [
  { action: "loan.approve", rule: "GUARD-01", thought: "Simulare: un agent încearcă să aprobe creditul. Aprobarea aparține exclusiv analistului uman, cu nivelul de autoritate cerut.", reason: "Agenții nu pot aproba credite." },
  { action: "policy.update", rule: "GUARD-02", thought: "Simulare: un agent încearcă să relaxeze pragul DSCR din politică. Politica se schimbă doar prin date versionate, nu prin agenți.", reason: "Agenții nu pot modifica politica de creditare." },
  { action: "evidence.delete", rule: "GUARD-03", thought: "Simulare: un agent încearcă să șteargă o dovadă din dosar. Dovezile sunt imuabile și auditate.", reason: "Agenții nu pot șterge dovezi." },
];

export const mockCreditApi = {
  listCreditCases: async (): Promise<CreditCaseSummary[]> => {
    need();
    await delay(140);
    return [...state().values()].map(summaryOf).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  },

  startAgentRun: async (caseId: string): Promise<AgentRun> => {
    const user = mut();
    await delay(220);
    const st = caseOf(caseId);
    if (st.run && st.run.status !== "FAILED") throw new ApiError(409, "Există deja o rulare pentru acest dosar");
    if (st.id !== "credit-codeforge") throw new ApiError(409, "Scenariul demonstrativ pornește doar pentru Codeforge Digital SRL");
    const run = newRun(st, user.username);
    st.run = run;
    play(st, codeforgePhase1());
    return structuredClone(run);
  },

  latestAgentRun: async (caseId: string): Promise<AgentRun> => {
    need();
    await delay(110);
    const st = caseOf(caseId);
    if (!st.run) throw new ApiError(404, "Nicio rulare pentru acest dosar");
    return structuredClone(st.run);
  },

  getAgentRun: async (runId: string): Promise<AgentRun> => {
    need();
    await delay(60);
    return structuredClone(runLocation(runId).run!);
  },

  subscribeRun: (runId: string, afterSeq: number, onStep: OnStep, onRun: OnRun): (() => void) => {
    const st = runLocation(runId);
    const listener: Listener = { onStep, onRun };
    // replay anything the caller has not seen yet, then stream live
    const t = setTimeout(() => {
      st.run!.steps.filter((s) => s.seq > afterSeq).forEach((s) => onStep(structuredClone(s)));
      onRun({ status: st.run!.status, updated_at: st.run!.updated_at });
      st.listeners.add(listener);
    }, 0);
    return () => {
      clearTimeout(t);
      st.listeners.delete(listener);
    };
  },

  reviewFacts: async (runId: string, body: ReviewBody): Promise<AgentRun> => {
    const user = mut();
    await delay(260);
    const st = runLocation(runId);
    const run = st.run!;
    if (run.status === "RUNNING") throw new ApiError(409, "Agenții lucrează încă; reîncercați în câteva secunde");
    let accepted = 0, rejected = 0, corrected = 0;
    if (body.accept_all_verified) {
      for (const f of run.board.facts) if (f.review === "pending" && f.verified && !f.conflict) { f.review = "accepted"; accepted += 1; }
    }
    for (const d of body.decisions) {
      const f = run.board.facts.find((x) => x.id === d.fact_id);
      if (!f) continue;
      if (d.action === "accept") { if (f.review !== "accepted") accepted += 1; f.review = "accepted"; }
      if (d.action === "reject") { f.review = "rejected"; rejected += 1; f.note = f.note ?? "Respins de analist."; }
      if (d.action === "correct" && d.value !== undefined) {
        f.value = d.value; f.review = "corrected"; corrected += 1; f.note = "Valoare corectată de analist.";
        const n = Number(d.value.replace(/\./g, "").replace(",", "."));
        f.normalized = Number.isFinite(n) ? n : f.normalized;
      }
      if (d.action !== "reject") f.conflict = false;
    }
    // conflicts the human has resolved close the matching issue
    for (const i of run.board.issues) {
      if (i.status === "open" && i.refs.length && i.refs.every((r) => run.board.facts.find((f) => f.id === r)?.review !== "pending")) {
        i.status = "resolved";
        i.resolution = `Confirmat de ${user.username} în revizie.`;
      }
    }
    pushStep(st, {
      agent: "human", kind: "event", title: `Revizie umană: ${accepted} acceptate, ${corrected} corectate, ${rejected} respinse`, ms: null, status: "ok",
      detail: { by: user.username, accepted, corrected, rejected, accept_all_verified: body.accept_all_verified },
    });
    return structuredClone(run);
  },

  simulateClientResponse: async (requestId: string): Promise<AgentRun> => {
    mut();
    await delay(240);
    const st = [...state().values()].find((c) => c.run?.requests.some((r) => r.id === requestId));
    if (!st || !st.run) throw new ApiError(404, "Cerere inexistentă");
    const run = st.run;
    const req = run.requests.find((r) => r.id === requestId)!;
    if (req.status === "ANSWERED") throw new ApiError(409, "Clientul a răspuns deja");
    req.status = "ANSWERED";
    req.answered_at = new Date().toISOString();
    req.items.forEach((i) => { i.satisfied = true; });
    run.status = "RUNNING";
    setAgent(st, "client", "done", "Răspuns primit în portal");
    if (st.id === "credit-codeforge") {
      codeforgeLaterDocs.forEach((d) => st.visible.add(`${st.id}-${d.key}`));
      pushStep(st, { agent: "client", kind: "event", title: "Clientul a răspuns în portal: 2 documente încărcate", ms: null, status: "info", detail: { request_id: requestId, documents: ["situatii_financiare_2024.pdf", "raport_evaluare_imobil.pdf"] } });
      setTimeout(() => play(st, codeforgePhase2()), 80);
    } else {
      pushStep(st, { agent: "client", kind: "event", title: "Clientul a răspuns în portal: CUI confirmat 41562039", ms: null, status: "info", detail: { request_id: requestId } });
      setTimeout(() => play(st, nordicPhase2()), 80);
    }
    return structuredClone(run);
  },

  decide: async (caseId: string, body: DecisionBody): Promise<Decision> => {
    const user = mut();
    await delay(350);
    const st = caseOf(caseId);
    const run = st.run;
    if (!run || run.id !== body.run_id) throw new ApiError(409, "Rularea nu mai este curentă");
    if (run.status !== "AWAITING_DECISION") throw new ApiError(409, "Dosarul nu este în așteptarea unei decizii");
    const rec = run.recommendation;
    if (!rec) throw new ApiError(409, "Nu există recomandare");

    const terms = body.action === "MODIFY" && body.terms ? body.terms : null;
    const level: Level = terms ? levelFor(st.profile.existingGroup + terms.amount) : rec.level;
    const needRank = ({ L1: 1, L2: 2, L3: 3 } as const)[level];
    const haveRank = ({ credit_analyst: 1, risk_officer: 2, credit_committee: 3 } as Record<string, number>)[user.role] ?? 0;
    if (haveRank < needRank) throw new ApiError(403, `Nu aveți autoritatea necesară pentru nivelul ${level}`);
    if (run.prepared_by === user.username) throw new ApiError(403, "Principiul celor 4 ochi: ați pregătit acest dosar și nu îl puteți semna");

    const pending = run.decision && run.decision.status === "PENDING_SECOND_VOTE" ? run.decision : null;
    if (pending && pending.votes.some((v) => v.username === user.username)) throw new ApiError(403, "Al doilea vot trebuie dat de un alt membru al comitetului");

    const override =
      (body.action === "APPROVE" && (rec.decision === "DECLINE" || rec.decision === "NEEDS_INFORMATION")) ||
      (body.action === "REJECT" && rec.decision !== "DECLINE") ||
      body.action === "MODIFY";
    if ((body.action === "MODIFY" || override) && !body.reason?.trim()) throw new ApiError(422, "Motivul este obligatoriu pentru modificări și abateri de la recomandare");

    const idx = rec.market.value_pct;
    let finalTerms: Decision["terms"] = null;
    if (body.action === "APPROVE") finalTerms = rec.proposed ?? termsFor(st.profile, rec.requested.amount, rec.requested.term_months, idx);
    if (body.action === "MODIFY" && body.terms) finalTerms = termsFor(st.profile, body.terms.amount, body.terms.term_months, idx);

    const vote = { username: user.username, role: user.role, action: body.action, at: new Date().toISOString() };
    if (pending && pending.votes[0]!.action !== body.action) throw new ApiError(409, "Al doilea vot diferă de primul; comitetul trebuie să se alinieze");
    const votes = pending ? [...pending.votes, vote] : [vote];
    const votesNeeded = level === "L3" ? 2 : 1;
    const base: Omit<Decision, "letter"> = {
      id: pending?.id ?? nextId("dec"),
      action: body.action,
      status: votes.length >= votesNeeded ? "FINAL" : "PENDING_SECOND_VOTE",
      terms: finalTerms,
      conditions: body.conditions ?? (body.action === "REJECT" ? [] : rec.conditions),
      reason: body.reason?.trim() || null,
      override,
      level,
      votes,
      human_seconds: (pending?.human_seconds ?? 0) + (body.human_seconds ?? 0) || null,
      created_at: pending?.created_at ?? new Date().toISOString(),
    };
    const decision: Decision = { ...base, letter: base.status === "FINAL" ? letterFor(st, base) : null };
    run.decision = decision;
    pushStep(st, {
      agent: "human", kind: "decision", ms: null, status: decision.status === "FINAL" ? "ok" : "info",
      title: decision.status === "FINAL"
        ? `Decizie finală: ${({ APPROVE: "Aprobat", MODIFY: "Modificat", REJECT: "Respins" } as const)[body.action]} de ${user.username} (${level})`
        : `Vot 1/2 înregistrat de ${user.username} (${level}); așteaptă al doilea vot`,
      detail: { by: user.username, role: user.role, action: body.action, override, level, human_seconds: body.human_seconds ?? null },
    });
    if (decision.status === "FINAL") {
      run.status = "DECIDED";
      setAgent(st, "human", "done", `${body.action === "REJECT" ? "Respins" : "Aprobat"} de ${user.username}`);
      touch(st);
    }
    return structuredClone(decision);
  },

  whatIf: async (runId: string, body: { amount: number; term_months: number }): Promise<WhatIf> => {
    need();
    await delay(120);
    const st = runLocation(runId);
    if (!(body.amount > 0) || !(body.term_months >= POLICY.minTerm && body.term_months <= POLICY.maxTerm)) throw new ApiError(422, "Sumă sau durată invalide");
    return calcWhatIf(st.profile, body.amount, body.term_months, latestIndex().value_pct);
  },

  getMarket: async (): Promise<MarketState> => {
    need();
    await delay(100);
    return marketState();
  },

  publishMarketSnapshot: async (body: { value_pct: number }): Promise<MarketState> => {
    const user = mut();
    await delay(300);
    const v = Number(body.value_pct);
    if (!Number.isFinite(v) || v <= 0 || v > 30) throw new ApiError(422, "Valoarea fixingului trebuie să fie între 0 și 30%");
    const last = latestIndex();
    market().snapshots.push({ as_of: today() > last.as_of ? today() : last.as_of, value_pct: round(v, 2), source: `Introdus manual (demo) de ${user.username}` });
    for (const st of state().values()) reevaluate(st, round(v, 2));
    return marketState();
  },

  redTeam: async (runId: string): Promise<AgentRun> => {
    mut();
    await delay(200);
    const st = runLocation(runId);
    const run = st.run!;
    const n = run.board.security.refused_actions;
    const t = RED_TEAM[n % RED_TEAM.length]!;
    pushStep(st, {
      agent: "guard", kind: "event", title: `Test de siguranță (simulare): un agent încearcă ${t.action}`, task: "guard.red_team", ms: null, status: "info",
      detail: { simulated: true, attempted: t.action },
    });
    run.board.security.refused_actions = n + 1;
    setAgent(st, "guard", "blocked", `${n + 1} ${n + 1 === 1 ? "acțiune interzisă blocată" : "acțiuni interzise blocate"}`);
    pushStep(st, {
      agent: "guard", kind: "refused", title: `${t.action} — BLOCAT DE POLITICĂ`, task: t.action, ms: 12, status: "refused",
      thought: t.thought,
      detail: { action: t.action, rule: t.rule, reason: t.reason, simulated: true, policy_version: POLICY.version },
    });
    return structuredClone(run);
  },

  getMetrics: async (): Promise<Metrics> => {
    need();
    await delay(140);
    const runs = [...state().values()].flatMap((s) => (s.run ? [s.run] : []));
    const facts = runs.flatMap((r) => r.board.facts);
    const withRequests = runs.filter((r) => r.requests.length);
    const decisions = runs.flatMap((r) => (r.decision && r.decision.status === "FINAL" && r.decision.human_seconds ? [r.decision.human_seconds] : []));
    const agentSecs = runs.filter((r) => r.status !== "RUNNING").map((r) => r.budget.elapsed_s);
    return {
      cases: state().size,
      client_rounds_avg: withRequests.length ? round(withRequests.reduce((a, r) => a + r.requests.length, 0) / withRequests.length, 1) : 0,
      evidence_coverage_pct: facts.length ? round((facts.filter((f) => f.verified).length / facts.length) * 100, 1) : 0,
      refused_actions: runs.reduce((a, r) => a + r.board.security.refused_actions, 0),
      injections_ignored: runs.reduce((a, r) => a + r.board.security.injections.length, 0),
      human_seconds_median: percentile(decisions, 0.5),
      manual_baseline_seconds: null,
      agent_seconds_median: percentile(agentSecs, 0.5),
      overrides: runs.filter((r) => r.decision?.override).length,
    };
  },
};

// ------------------------------------------------------------------ hooks used by the legacy mock (documents / viewer)

export function creditCaseDetail(id: string): CaseDetail | null {
  const st = state().get(id);
  if (!st) return null;
  return {
    id: st.id, title: st.title, revision: 1, owner_id: "u-credit-analyst", created_at: st.created_at,
    documents: st.allDocs.filter((d) => st.visible.has(d.id)).map((d) => structuredClone(d)),
    // Same shape as the real API's case meta (backend: Case.meta).
    meta: { company: st.company, cui: st.cui, caen: st.caen, channel: st.channel, ...st.profile.requested },
  } as CaseDetail;
}

export function creditDocPages(docId: string): string[] | null {
  for (const st of state().values()) {
    const d = st.allDocs.find((x) => x.id === docId);
    if (d) return d.pages;
  }
  return null;
}
