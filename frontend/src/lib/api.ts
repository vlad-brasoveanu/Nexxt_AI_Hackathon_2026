import type {
  CaseDetail, CaseSummary, FactSet, FactsResp, Finding, Health, Proposal, Run, SessionResp, TraceStep,
} from "./types";
import { mockApi } from "./mock";
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
};

export type Api = typeof realApi;

export const api: Api = new Proxy({} as Api, {
  get(_t, key: keyof Api) {
    return (isMock() ? mockApi : realApi)[key];
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
