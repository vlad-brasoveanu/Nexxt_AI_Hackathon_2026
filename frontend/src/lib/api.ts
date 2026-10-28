import type {
  CaseDetail, CaseSummary, FactSet, FactsResp, Finding, Health, Proposal, Run, SessionResp, TraceStep,
} from "./types";
import type {
  AgentRun, AgentStep, CreditCaseSummary, Decision, HumanAction, MarketState, Metrics, RunStatus, WhatIf,
} from "./agent-types";
import type { RiskReport, AdminUsers, AuditPage, AdminPolicies, UserChange, AdminRole } from "./planner-types";
import type { User } from "./types";
import { mockApi } from "./mock";
import { mockCreditApi } from "./mock-credit";
import { ApiError } from "./errors";

export { ApiError };

// Session cookie travels same-origin; mutations must echo the CSRF token from the session response.
let csrfToken: string | null = null;

export function isMock(): boolean {
  if (import.meta.env["VITE_MOCK"] === "1") return true;
  return typeof window !== "undefined" && window.location.hostname.includes("lovable");
}

async function send(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string>; base?: string } = {}): Promise<Response> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (method !== "GET" && csrfToken) headers["x-csrf-token"] = csrfToken;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch((opts.base ?? "/api/v1") + path, {
    method,
    credentials: "same-origin",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      if (typeof j?.detail === "string") detail = j.detail;
      else if (j?.detail?.message) detail = j.detail.message;
      else if (j?.detail?.reasons) detail = j.detail.reasons.join(" ");
      else if (Array.isArray(j?.detail)) detail = j.detail.map((v: {msg: string}) => v.msg).join("; ");
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, detail);
  }
  return res;
}

async function request<T>(path: string, opts: Parameters<typeof send>[1] = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ReviewBody = {
  accept_all_verified: boolean;
  decisions: { fact_id: string; action: "accept" | "reject" | "correct"; value?: string; reason?: string }[];
};
export type DecisionBody = {
  run_id: string;
  action: HumanAction;
  terms?: { amount: number; term_months: number };
  conditions?: string[];
  reason?: string;
  human_seconds?: number;
  demo_exception?: boolean;
};
export type RunEvent = { status: RunStatus; updated_at: string };
export type OnStep = (step: AgentStep) => void;
export type OnRun = (run: RunEvent) => void;

/** Statuses in which nothing more happens until a person (or the client) acts. */
export const RESTING: RunStatus[] = ["WAITING_CLIENT", "AWAITING_DECISION", "DECIDED", "FAILED"];

/**
 * Live run updates. Server-sent events first; if the stream errors, fall back to polling the run every 1500 ms.
 * Returns an unsubscribe function.
 */
function subscribeRunSse(runId: string, afterSeq: number, onStep: OnStep, onRun: OnRun): () => void {
  let closed = false;
  let ended = false;
  let last = afterSeq;
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastStamp = "";

  const emitStep = (s: AgentStep) => {
    if (s.seq > last) {
      last = s.seq;
      onStep(s);
    }
  };

  const poll = async () => {
    if (closed) return;
    try {
      const r = await request<AgentRun>(`/agent-runs/${runId}`);
      r.steps.forEach(emitStep);
      const stamp = `${r.status}|${r.updated_at}`;
      if (stamp !== lastStamp) {
        lastStamp = stamp;
        onRun({ status: r.status, updated_at: r.updated_at });
      }
      if (RESTING.includes(r.status)) return; // nothing more to wait for
    } catch {
      /* transient: keep polling */
    }
    if (!closed) timer = setTimeout(poll, 1500);
  };

  const startPolling = () => {
    if (closed || ended || timer) return;
    timer = setTimeout(poll, 0);
  };

  try {
    es = new EventSource(`/api/v1/agent-runs/${encodeURIComponent(runId)}/events?after=${afterSeq}`);
    es.addEventListener("step", (ev) => {
      try { emitStep(JSON.parse((ev as MessageEvent<string>).data) as AgentStep); } catch { /* malformed event */ }
    });
    es.addEventListener("run", (ev) => {
      try { onRun(JSON.parse((ev as MessageEvent<string>).data) as RunEvent); } catch { /* malformed event */ }
    });
    es.addEventListener("end", () => {
      ended = true;
      es?.close();
    });
    es.onerror = () => {
      es?.close();
      es = null;
      startPolling();
    };
  } catch {
    startPolling();
  }

  return () => {
    closed = true;
    es?.close();
    if (timer) clearTimeout(timer);
  };
}

const realApi = {
  getSession: async () => {
    const s = await request<SessionResp>("/session");
    csrfToken = s.csrf_token;
    return s;
  },
  login: async (username: string, password: string) => {
    const s = await request<SessionResp>("/session", { method: "POST", body: { username, password } });
    csrfToken = s.csrf_token;
    return s;
  },
  logout: async () => {
    await request<void>("/session", { method: "DELETE" });
    csrfToken = null;
  },
  listCases: () => request<CaseSummary[]>("/cases"),
  getCase: (id: string) => request<CaseDetail>(`/cases/${id}`),
  // The download endpoint sends application/octet-stream as an attachment, so the viewer
  // re-types the bytes as PDF and shows them through an object URL.
  documentBlob: async (id: string) => {
    const res = await send(`/documents/${id}/download`);
    return new Blob([await res.arrayBuffer()], { type: "application/pdf" });
  },
  runExtraction: (caseId: string) => request<Proposal>(`/cases/${caseId}/extractions`, { method: "POST" }),
  latestExtraction: (caseId: string) => request<Proposal>(`/cases/${caseId}/extractions/latest`),
  confirmFacts: (caseId: string, expected_revision: number, facts: FactSet) =>
    request<unknown>(`/cases/${caseId}/facts`, { method: "POST", body: { expected_revision, facts } }),
  getFacts: (caseId: string) => request<FactsResp>(`/cases/${caseId}/facts`),
  createRun: (caseId: string, expected_revision: number, evaluation_date: string) =>
    request<Run>(`/cases/${caseId}/runs`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { expected_revision, evaluation_date },
    }),
  listRuns: (caseId: string) => request<Run[]>(`/cases/${caseId}/runs`),
  getFindings: async (runId: string) =>
    (await request<{ is_current: boolean; findings: Finding[] }>(`/runs/${runId}/findings`)).findings,
  getTrace: (runId: string) => request<TraceStep[]>(`/runs/${runId}/trace`),
  health: () => request<Health>("/health", { base: "" }),

  // ---- credit workflow (multi-agent) ----
  listCreditCases: () => request<CreditCaseSummary[]>("/credit-cases"),
  startAgentRun: (caseId: string) =>
    request<AgentRun>(`/cases/${caseId}/agent-runs`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } }),
  latestAgentRun: (caseId: string) => request<AgentRun>(`/cases/${caseId}/agent-runs/latest`),
  getAgentRun: (runId: string) => request<AgentRun>(`/agent-runs/${runId}`),
  subscribeRun: (runId: string, afterSeq: number, onStep: OnStep, onRun: OnRun): (() => void) =>
    subscribeRunSse(runId, afterSeq, onStep, onRun),
  reviewFacts: (runId: string, body: ReviewBody) =>
    request<AgentRun>(`/agent-runs/${runId}/review`, { method: "POST", body }),
  simulateClientResponse: (requestId: string) =>
    request<AgentRun>(`/client-requests/${requestId}/simulate-response`, { method: "POST" }),
  decide: (caseId: string, body: DecisionBody) =>
    request<Decision>(`/cases/${caseId}/decision`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body }),
  whatIf: (runId: string, body: { amount: number; term_months: number }) =>
    request<WhatIf>(`/agent-runs/${runId}/what-if`, { method: "POST", body }),
  getMarket: () => request<MarketState>("/market"),
  publishMarketSnapshot: (body: { value_pct: number }) =>
    request<MarketState>("/market/snapshots", { method: "POST", body }),
  redTeam: (runId: string) => request<AgentRun>(`/agent-runs/${runId}/red-team`, { method: "POST" }),
  getMetrics: () => request<Metrics>("/metrics"),
  sendClientRequest: (id: string) => request<{id:string;status:string}>(`/client-requests/${id}/send`,{method:"POST"}),
  riskPlanner: (id:string, body:{cfads_drop_pct:number;rate_shock_pp:number}) => request<RiskReport>(`/agent-runs/${id}/risk-planner`,{method:"POST",body}),
  riskReports: (id:string) => request<RiskReport[]>(`/cases/${id}/risk-reports`),
  adminUsers: () => request<AdminUsers>("/admin/users"),
  adminCreateUser: (body:{username:string;password:string;role:AdminRole;authority_level:string|null;reason:string}) => request<User>("/admin/users",{method:"POST",body}),
  adminUpdateUser: (id:string,body:UserChange) => request<User>(`/admin/users/${id}`,{method:"PATCH",body}),
  adminAudit: (params:URLSearchParams) => request<AuditPage>(`/admin/audit?${params}`),
  adminPolicies: () => request<AdminPolicies>("/admin/policies"),
  publishPolicy: (body:{expected_version:string;reason:string;dscr_min:number;dscr_stressed_min:number;net_debt_ebitda_max:number;ltv_max_pct:number}) => request<{version:string}>("/admin/policies",{method:"POST",body}),
  createCreditCase: (credit:Record<string,unknown>) => request<CaseDetail>("/cases",{method:"POST",body:{title:String(credit.company),kind:"credit",credit}}),
  uploadCreditDocument: async (caseId:string, revision:number, kind:string, file:File, supersedes?:string) => {
    const body=new FormData();body.set("expected_revision",String(revision));body.set("kind",kind);body.set("file",file);if(supersedes)body.set("supersedes_document_id",supersedes);
    const res=await fetch(`/api/v1/cases/${caseId}/documents`,{method:"POST",credentials:"same-origin",headers:{"x-csrf-token":csrfToken ?? ""},body});
    const data=await res.json();if(!res.ok) throw new Error(typeof data.detail==="string"?data.detail:data.detail?.message ?? "Documentul nu a putut fi încărcat.");
    return data as {revision:number};
  },
};

export type Api = typeof realApi;

// Compile-time guard: every mock credit method must have the same signature as the real one.
type MockCredit = typeof mockCreditApi;
const _mockMatchesReal: { [K in keyof MockCredit]: K extends keyof Api ? Api[K] : never } = mockCreditApi;
void _mockMatchesReal;

const mockAll = { ...mockApi, ...mockCreditApi };

export const api: Api = new Proxy({} as Api, {
  get(_t, key: keyof Api) {
    if (isMock() && !(key in mockAll)) return () => Promise.reject(new Error("Această funcție necesită backend-ul real. Deschideți demo-ul pe portul 8000."));
    return (isMock() ? mockAll : realApi)[key as keyof typeof mockAll];
  },
});

/** Returns null on 404 instead of throwing. */
export async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
