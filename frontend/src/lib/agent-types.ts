// Contract for the multi-agent credit workflow. The backend (app/api/routes/agents.py, credit.py, market.py)
// returns exactly these shapes; lib/mock.ts mirrors them for `npm run dev:mock`.
import type { Evidence, Fact } from "./types";

export type AgentId =
  | "orchestrator" | "analyst" | "completeness" | "financials" | "cashflow"
  | "kyb" | "policy" | "memo" | "critic" | "guard" | "human" | "client";

export type CreditRole = "credit_analyst" | "risk_officer" | "credit_committee";
export type RunStatus = "RUNNING" | "WAITING_CLIENT" | "AWAITING_DECISION" | "DECIDED" | "FAILED";
export type Tier = "small" | "large" | "none";
export type ProcessingMode = "cloud" | "local" | "deterministic";

export type ModelUse = { provider: string; model: string; tier: Tier; mode: ProcessingMode; latency_ms?: number | null; error?: string | null };

export type StepKind = "plan" | "dispatch" | "result" | "challenge" | "refused" | "event" | "request" | "decision" | "error";
export type StepStatus = "ok" | "warning" | "failed" | "refused" | "info";

export type AgentStep = {
  seq: number;
  agent: AgentId;
  kind: StepKind;
  title: string;                 // short Romanian label for the timeline
  thought: string | null;        // planner / critic reasoning, one or two sentences
  task: string | null;           // catalogue task id, e.g. "cashflow.analyze"
  status: StepStatus;
  model: ModelUse | null;        // null for purely deterministic steps
  duration_ms: number | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type AgentState = "idle" | "running" | "done" | "stale" | "failed" | "blocked";

export type AgentCard = {
  id: AgentId;
  title: string;                 // "Agent Fluxuri de numerar"
  role: string;                  // one-line description
  status: AgentState;
  runs: number;
  tier: Tier;                    // which model size this agent is routed to
  last_summary: string | null;
};

export type PlanItem = { task: string; agent: AgentId; why: string; status: "pending" | "running" | "done" | "skipped" | "refused" };

export type MetricUnit = "RON" | "%" | "x" | "ani" | "zile" | "luni";
export type Metric = {
  id: string;                    // "dscr", "ebitda_2025", "turnover_gap_pct", ...
  label: string;
  value: number;
  unit: MetricUnit;
  display: string;               // Romanian formatted, e.g. "1,09x" or "7.900.000 RON"
  agent: AgentId;
  formula: string | null;
  sources: Evidence[];           // literal spans the value was derived from (may be capped to top contributors)
  benchmark: { sector: string; p25: number; median: number; p75: number; percentile: number } | null;
};

export type Issue = {
  id: string;
  agent: AgentId;
  severity: "info" | "warning" | "blocking";
  title: string;
  detail: string;
  refs: string[];                // metric ids, fact ids or document ids
  status: "open" | "resolved" | "requested";
  resolution: string | null;
};

export type RuleResult = {
  rule_id: string;               // "CR-01"
  title: string;
  outcome: "PASS" | "FAIL" | "UNKNOWN" | "WARN";
  detail: string;
  value: string | null;
  threshold: string | null;
  metric_refs: string[];
};

export type ReviewFact = Fact & {
  agent: AgentId;
  label: string;
  normalized: number | null;
  verified: boolean;             // literal quote found in the stored document version
  review: "pending" | "accepted" | "corrected" | "rejected";
  conflict: boolean;             // part of an open issue: cannot be bulk-accepted
  note?: string | null;          // [frontend addition] why a value was rejected / corrected / flagged, when known
};

export type GraphNode = { id: string; label: string; type: "applicant" | "person" | "company"; flags: string[]; exposure: number | null };
export type GraphEdge = { source: string; target: string; label: string; share_pct: number | null };

export type Precedent = {
  id: string; sector: string; year: number; amount: number; dscr: number; net_debt_ebitda: number;
  decision: "APPROVE" | "MODIFY" | "DECLINE"; outcome_24m: "performing" | "late" | "default" | null; similarity: number;
};

export type Benchmark = { metric: string; label: string; sector: string; p25: number; median: number; p75: number; value: number; percentile: number };

export type Board = {
  facts: ReviewFact[];
  metrics: Metric[];
  issues: Issue[];
  rules: RuleResult[];
  financials: { years: { year: number; items: Record<string, number> }[] } | null;
  cashflow: {
    period: string;
    monthly: { month: string; inflow: number; outflow: number; operating_inflow: number }[];
    classes: { key: string; label: string; amount: number; share_pct: number }[];
    top_clients: { name: string; amount: number; share_pct: number }[];
  } | null;
  kyb: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    ubo: { name: string; share_pct: number; via: string }[];
    group_exposure: number;
    sanctions_hits: number;
    kyc_checks: { rule_id: string; outcome: string; detail: string }[];
  } | null;
  analyst: {
    risk_class: "A" | "B" | "C" | null;
    summary: string;
    benchmarks: Benchmark[];
    precedents: Precedent[];
    neighbors: { n: number; approved_pct: number; default_rate_pct: number; ci_low_pct: number; ci_high_pct: number } | null;
  } | null;
  memo: { text: string; verified_numbers: number; unverified: string[]; model: ModelUse | null } | null;
  security: { injections: { document_id: string; filename: string; quote: string }[]; refused_actions: number };
};

export type Terms = {
  amount: number;
  term_months: number;
  rate_pct: number;
  margin_pct: number;
  index: string;
  index_value_pct: number;
  monthly_payment: number;
  dscr: number;
  dscr_stressed: number;
  ltv_pct: number | null;
};

export type RecommendationKind = "APPROVE" | "APPROVE_WITH_CONDITIONS" | "COUNTER_OFFER" | "DECLINE" | "NEEDS_INFORMATION";

export type Recommendation = {
  decision: RecommendationKind;
  requested: { amount: number; term_months: number; product: string; purpose: string };
  proposed: Terms | null;
  reasons: { code: string; text: string; refs: string[] }[];
  conditions: string[];
  level: "L1" | "L2" | "L3";
  level_reason: string;
  policy_version: string;
  market: { index: string; value_pct: number; as_of: string; source: string };
  superseded: boolean;           // a newer policy/market evaluation replaced it
};

export type ClientRequest = {
  id: string;
  round: number;
  status: "DRAFT" | "SENT" | "ANSWERED" | "PARTIAL";
  channel: string;               // "Portal client (simulat)"
  message: string;
  items: { code: string; title: string; reason: string; refs: string[]; satisfied: boolean }[];
  sent_at: string;
  answered_at: string | null;
};

export type HumanAction = "APPROVE" | "MODIFY" | "REJECT";

export type Decision = {
  id: string;
  action: HumanAction;
  status: "FINAL" | "PENDING_SECOND_VOTE";
  terms: Terms | null;
  conditions: string[];
  reason: string | null;
  override: boolean;
  demo_exception?: boolean;
  level: "L1" | "L2" | "L3";
  votes: { username: string; role: string; action: HumanAction; at: string }[];
  human_seconds: number | null;
  letter: string | null;          // drafted offer / decline letter (sending stays human)
  created_at: string;
};

export type AgentRun = {
  id: string;
  case_id: string;
  status: RunStatus;
  case_revision: number;
  is_current: boolean;
  review_complete?: boolean;
  reviewed_by?: string[];
  mode_label: string;            // "Cloud demo · featherless · Qwen2.5-14B / 7B · date sintetice" or "Mod determinist · fără AI"
  budget: { used: number; limit: number; deadline_s: number; elapsed_s: number };
  agents: AgentCard[];
  plan: PlanItem[];
  steps: AgentStep[];
  board: Board;
  recommendation: Recommendation | null;
  requests: ClientRequest[];
  request_history?: ClientRequest[];
  decision: Decision | null;
  prepared_by?: string | null;   // [frontend addition] username that prepared the file (four-eyes: may not sign)
  created_at: string;
  updated_at: string;
};

export type CreditCaseSummary = {
  id: string;
  title: string;
  company: string;
  cui: string;
  amount: number;
  term_months: number;
  product: string;
  channel: "online" | "sucursală";
  created_at: string;
  run: { id: string; status: RunStatus; level: "L1" | "L2" | "L3" | null; recommendation: RecommendationKind | null; updated_at: string; last_step: string | null } | null;
  waiting_for: CreditRole | "client" | "analyst" | "case_officer" | "risk_reviewer" | null;
  routing_reason?: string | null; // [frontend addition] one-line "why is it in this queue / at this level"
};

export type MarketState = {
  index: string;
  value_pct: number;
  as_of: string;
  source: string;
  policy_version: string;
  history: { value_pct: number; as_of: string; source: string }[];
};

export type Metrics = {
  cases: number;
  client_rounds_avg: number;
  evidence_coverage_pct: number;
  refused_actions: number;
  injections_ignored: number;
  human_seconds_median: number | null;
  manual_baseline_seconds: number | null;   // measured by a team member, from fixtures/credit/baseline.json
  agent_seconds_median: number | null;
  overrides: number;
};

export type WhatIf = {
  amount: number; term_months: number; rate_pct: number; monthly_payment: number; dscr: number; dscr_stressed: number; ltv_pct: number | null; passes: boolean;
  level?: "L1" | "L2" | "L3";    // [frontend addition] authority level the modified terms would need
  level_reason?: string;
};
