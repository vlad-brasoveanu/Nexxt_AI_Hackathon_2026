import type { Disposition, DocKind, Outcome, Role } from "./types";
import type { AgentId, AgentState, CreditRole, HumanAction, RecommendationKind, RunStatus, StepKind, StepStatus, Tier } from "./agent-types";

export const KIND_LABEL: Record<DocKind, string> = {
  application: "Cerere deschidere cont",
  company_extract: "Certificat constatator ONRC",
  identity: "Act de identitate",
  ownership: "Declarație beneficiar real",
  declaration: "Declarație",
  mandate: "Împuternicire",
  credit_application: "Cerere de finanțare",
  financial_statements: "Situații financiare",
  bank_statement: "Extras de cont",
  collateral_valuation: "Raport de evaluare",
  bureau_report: "Raport Biroul de Credit",
  other: "Alt document",
};
// Documents the agents create from their source lookups, so evidence can cite them like any upload.
const EXTRA_KIND_LABEL: Record<string, string> = {
  articles: "Act constitutiv",
  client_letter: "Scrisoare client",
  source_registry: "Registrul comerțului · interogare agent",
  source_bureau: "Biroul de Credit · interogare agent",
  source_exposures: "Expuneri interne de grup · interogare agent",
  source_sanctions: "Screening sancțiuni · interogare agent",
};
export const kindLabel = (k: string) => (KIND_LABEL as Record<string, string>)[k] ?? EXTRA_KIND_LABEL[k] ?? k;

const FIELD_LABEL: Record<string, string> = {
  company_identifier: "CUI",
  extract_date: "Data extrasului",
  identity_expiry: "Expirare act identitate",
  company_name: "Denumire societate",
  beneficial_owner: "Beneficiar real",
};
export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f;

export const DISPOSITION: Record<string, { label: string; tone: Tone }> = {
  READY_FOR_REVIEW: { label: "Gata de revizuire", tone: "success" },
  NEEDS_INFORMATION: { label: "Necesită informații", tone: "warning" },
  ESCALATED: { label: "Escaladat", tone: "danger" },
  NONE: { label: "Neevaluat", tone: "neutral" },
};
export const dispKey = (d: Disposition | undefined) => d ?? "NONE";

export const OUTCOME: Record<Outcome, { label: string; tone: Tone }> = {
  FAIL: { label: "FAIL", tone: "danger" },
  UNKNOWN: { label: "UNKNOWN", tone: "warning" },
  PASS: { label: "PASS", tone: "success" },
  NOT_APPLICABLE: { label: "N/A", tone: "neutral" },
};
export const OUTCOME_ORDER: Outcome[] = ["FAIL", "UNKNOWN", "PASS", "NOT_APPLICABLE"];

export type Tone = "success" | "warning" | "danger" | "neutral";

export const ROLE_LABEL: Record<Role, string> = {
  case_officer: "Ofițer dosar", risk_reviewer: "Analist risc / decident", admin: "Administrator",
  manager: "Manager relație",
  analyst: "Analist operațiuni",
  credit_analyst: "Analist credit · L1",
  risk_officer: "Ofițer risc · L2",
  credit_committee: "Comitet credit · L3",
  supervisor: "Supervizor",
};
export const roleLabel = (r: string) => (ROLE_LABEL as Record<string, string>)[r] ?? r;

/** Semantic tones for the HUD badges (the legacy `Tone` is kept for the KYC screens). */
export type PillTone = Tone | "info" | "violet" | "agent" | "human";

// ---------- credit workflow ----------

export const AGENT_META: Record<AgentId, { name: string; short: string }> = {
  orchestrator: { name: "Orchestrator", short: "Orchestrator" },
  analyst: { name: "Analist financiar complex", short: "Analist financiar" },
  completeness: { name: "Agent Completitudine", short: "Completitudine" },
  financials: { name: "Agent Situații financiare", short: "Situații financiare" },
  cashflow: { name: "Agent Fluxuri de numerar", short: "Fluxuri de numerar" },
  kyb: { name: "Agent KYB/Diligență", short: "KYB / Diligență" },
  policy: { name: "Agent Politică", short: "Politică" },
  memo: { name: "Agent Memo", short: "Memo" },
  critic: { name: "Agent Critic", short: "Critic" },
  guard: { name: "Gardă de acțiuni", short: "Gardă" },
  human: { name: "Analist uman", short: "Analist uman" },
  client: { name: "Client (portal simulat)", short: "Client" },
};
export const agentName = (id: AgentId) => AGENT_META[id]?.name ?? id;
export const agentShort = (id: AgentId) => AGENT_META[id]?.short ?? id;

export const TIER_META: Record<Tier, { label: string; short: string }> = {
  small: { label: "model mic", short: "MIC" },
  large: { label: "model mare", short: "MARE" },
  none: { label: "determinist", short: "DET" },
};

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  idle: "în repaus",
  running: "rulează",
  done: "gata",
  stale: "depășit",
  failed: "eșuat",
  blocked: "blocat",
};

export const RUN_STATUS_META: Record<RunStatus, { label: string; tone: PillTone }> = {
  RUNNING: { label: "Agenții lucrează", tone: "agent" },
  WAITING_CLIENT: { label: "Așteaptă clientul", tone: "warning" },
  AWAITING_DECISION: { label: "Așteaptă decizia", tone: "human" },
  DECIDED: { label: "Decis", tone: "success" },
  FAILED: { label: "Eșuat", tone: "danger" },
};

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  plan: "PLAN",
  dispatch: "DELEGARE",
  result: "REZULTAT",
  challenge: "CONTESTARE",
  refused: "BLOCAT",
  event: "EVENIMENT",
  request: "CERERE",
  decision: "DECIZIE",
  error: "EROARE",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  ok: "OK",
  warning: "ATENȚIE",
  failed: "EȘUAT",
  refused: "BLOCAT",
  info: "INFO",
};

export const REC_LABEL: Record<RecommendationKind, string> = {
  APPROVE: "Aprobare",
  APPROVE_WITH_CONDITIONS: "Aprobare cu condiții",
  COUNTER_OFFER: "Contraofertă",
  DECLINE: "Respingere",
  NEEDS_INFORMATION: "Necesită informații",
};
export const REC_TONE: Record<RecommendationKind, PillTone> = {
  APPROVE: "success",
  APPROVE_WITH_CONDITIONS: "success",
  COUNTER_OFFER: "warning",
  DECLINE: "danger",
  NEEDS_INFORMATION: "info",
};

export const ACTION_LABEL: Record<HumanAction, string> = { APPROVE: "Aprobă", MODIFY: "Modifică", REJECT: "Respinge" };
export const ACTION_DONE_LABEL: Record<HumanAction, string> = { APPROVE: "Aprobat", MODIFY: "Modificat", REJECT: "Respins" };

export const LEVELS = ["L1", "L2", "L3"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_ROLE: Record<Level, { role: CreditRole; label: string; votes: number }> = {
  L1: { role: "credit_analyst", label: "Decident · L1", votes: 1 },
  L2: { role: "risk_officer", label: "Decident · L2", votes: 1 },
  L3: { role: "credit_committee", label: "Decidenți · L3", votes: 2 },
};
/** Authority rank of a role; roles outside the credit chain have none. */
export const ROLE_RANK: Partial<Record<Role, number>> = { credit_analyst: 1, risk_officer: 2, credit_committee: 3 };
export const LEVEL_RANK: Record<Level, number> = { L1: 1, L2: 2, L3: 3 };

export const WAITING_FOR_LABEL: Record<string, string> = {
  case_officer: "Ofițer dosar", risk_reviewer: "Analist risc / decident", admin: "Administrator",
  client: "Client",
  analyst: "Analist",
  credit_analyst: "Analist credit · L1",
  risk_officer: "Ofițer risc · L2",
  credit_committee: "Comitet credit · L3",
};

export const ISSUE_SEVERITY_LABEL = { info: "info", warning: "atenție", blocking: "blocant" } as const;
export const OUTCOME_RULE_LABEL = { PASS: "TRECE", FAIL: "NU TRECE", UNKNOWN: "NECUNOSCUT", WARN: "ATENȚIE" } as const;

export const CASH_CLASS_LABEL: Record<string, string> = {
  operational: "Operațional",
  intragroup: "Intragrup",
  associates: "Asociați",
  financial: "Financiar",
};

export const shortSha = (s: string) => s.slice(0, 12);
// The API stores UTC timestamps; SQLite drops the offset, so treat naive values as UTC.
export const parseTs = (s: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : s + "Z");
export const fmtDate = (s?: string) => (s ? new Date(parseTs(s)).toLocaleDateString("ro-RO") : "—");
export const fmtDateTime = (s?: string) =>
  s ? new Date(parseTs(s)).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" }) : "—";
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
