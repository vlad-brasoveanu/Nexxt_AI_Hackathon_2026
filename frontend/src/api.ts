export type User = { id: string; username: string; role: string };
export type Evidence = {
  document_id: string;
  sha256: string;
  page: number;
  start: number;
  end: number;
  quote: string;
};
export type Fact = {
  id: string;
  entity_id: string;
  field: string;
  value: string;
  evidence: Evidence;
};
export type Doc = {
  id: string;
  kind: string;
  filename: string;
  sha256: string;
  pages: string[];
};
export type Case = {
  id: string;
  title: string;
  revision: number;
  owner_id: string;
  created_at: string;
  documents?: Doc[];
};
export type Finding = {
  rule_id: string;
  module_id: string;
  outcome: "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
  severity: string;
  explanation: string;
  required_action: string;
  evidence: Evidence[];
  entity_id: string | null;
};
export type Run = {
  id: string;
  case_id: string;
  case_revision: number;
  status: string;
  is_current?: boolean;
  snapshot: { evaluation_date: string };
  result: {
    status: string;
    disposition: string | null;
    scope: string;
    processing_mode: string;
    findings: Finding[];
    trace: {
      step_id: string;
      module: { id: string; version: string };
      status: string;
      duration_ms: number;
      error_code?: string;
    }[];
  };
};
export type Module = {
  id: string;
  version: string;
  rule_ids: string[];
  input_schema: string;
  output_schema: string;
};
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (init.method && init.method !== "GET") headers.set("x-csrf-token", csrf);
  const response = await fetch("/api/v1" + path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    let detail = "Serviciul nu este disponibil.";
    try {
      const body = await response.json();
      detail =
        typeof body.detail === "string"
          ? body.detail
          : "Verifică datele introduse.";
    } catch {
      /* non-JSON error */
    }
    throw new Error(`${response.status} · ${detail}`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const post = <T>(path: string, body: unknown, headers?: HeadersInit) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body), headers });
