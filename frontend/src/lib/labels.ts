import type { Disposition, DocKind, Outcome } from "./types";

export const KIND_LABEL: Record<DocKind, string> = {
  application: "Cerere deschidere cont",
  company_extract: "Certificat constatator ONRC",
  identity: "Act de identitate",
  ownership: "Declarație beneficiar real",
  declaration: "Declarație",
  mandate: "Împuternicire",
};

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

export const ROLE_LABEL = { manager: "Manager", analyst: "Analist", supervisor: "Supervizor" } as const;

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
