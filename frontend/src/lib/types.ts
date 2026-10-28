export type Role = "manager" | "analyst" | "credit_analyst" | "risk_officer" | "credit_committee" | "supervisor";
export type User = { id: string; username: string; role: Role };
export type SessionResp = { user: User; csrf_token: string };
export type Evidence = { document_id: string; sha256: string; page: number; start: number; end: number; quote: string };
export type Fact = { id: string; entity_id: string; field: string; value: string; evidence: Evidence };
export type FactSet = { schema_version: "FactSet.v1"; extraction_mode: "manual_structured" | "ai_assisted"; facts: Fact[] };
export type DocKind =
  | "application" | "company_extract" | "identity" | "ownership" | "declaration" | "mandate"
  // credit workflow
  | "credit_application" | "financial_statements" | "bank_statement" | "collateral_valuation" | "bureau_report" | "other";
export type Doc = { id: string; kind: DocKind; filename: string; sha256: string; pages: string[] };
export type CaseSummary = { id: string; title: string; revision: number; owner_id: string; created_at: string };
export type CaseDetail = CaseSummary & { documents: Doc[] };
export type Rejected = { document_id: string; kind: DocKind; field: string; value: string; reason: string };
export type Proposal = {
  id: string; case_revision: number; is_current: boolean; status: "COMPLETED" | "FAILED";
  provider: string; model: string; mode: string; label: string; prompt_version: string; latency_ms: number;
  facts: FactSet; rejected: Rejected[]; calls: { document_id: string; kind: DocKind; latency_ms: number }[];
  error: string | null; created_at: string;
};
export type FactsResp = { revision: number; is_current: boolean; facts: FactSet };
export type Outcome = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
export type Finding = {
  rule_id: string; module_id: string; outcome: Outcome; severity: string; explanation: string;
  required_action: string; evidence: Evidence[]; entity_id: string | null;
};
export type Disposition = "READY_FOR_REVIEW" | "NEEDS_INFORMATION" | "ESCALATED" | null;
export type Run = {
  id: string; case_id: string; case_revision: number; status: string; is_current?: boolean;
  snapshot: { evaluation_date: string; workflow: { id: string; version: string } };
  result: { status: string; disposition: Disposition; scope: string; processing_mode: string; findings: Finding[] };
  created_at?: string;
};
export type TraceStep = {
  step_id: string; module: { id: string; version: string; rule_ids: string[] };
  status: "SUCCEEDED" | "FAILED" | string; duration_ms: number; error_code?: string;
};
export type Health = { ai_enabled: boolean; ai: { provider: string; model: string; mode: string } };
