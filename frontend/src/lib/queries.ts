import { queryOptions } from "@tanstack/react-query";
import { api, orNull } from "./api";

export const sessionQ = () =>
  queryOptions({ queryKey: ["session"], queryFn: () => orNull(api.getSession().catch((e) => { if (e?.status === 401) return null; throw e; })), retry: false });
export const healthQ = () => queryOptions({ queryKey: ["health"], queryFn: () => api.health(), retry: false, staleTime: 60000 });
export const casesQ = () => queryOptions({ queryKey: ["cases"], queryFn: () => api.listCases() });
export const caseQ = (id: string) => queryOptions({ queryKey: ["case", id, "detail"], queryFn: () => api.getCase(id) });
export const runsQ = (id: string) => queryOptions({ queryKey: ["case", id, "runs"], queryFn: () => api.listRuns(id) });
export const factsQ = (id: string) => queryOptions({ queryKey: ["case", id, "facts"], queryFn: () => orNull(api.getFacts(id)) });
export const proposalQ = (id: string) => queryOptions({ queryKey: ["case", id, "proposal"], queryFn: () => orNull(api.latestExtraction(id)) });
export const findingsQ = (runId: string) => queryOptions({ queryKey: ["run", runId, "findings"], queryFn: () => api.getFindings(runId) });
export const traceQ = (runId: string) => queryOptions({ queryKey: ["run", runId, "trace"], queryFn: () => api.getTrace(runId) });
export const documentQ = (docId: string) =>
  queryOptions({ queryKey: ["document", docId], queryFn: () => api.documentBlob(docId), staleTime: Infinity });

// ---- credit workflow (multi-agent) ----
export const creditCasesQ = () =>
  queryOptions({ queryKey: ["credit-cases"], queryFn: () => api.listCreditCases() });
/** Latest agent run of a credit case; null when the agents have not been started yet (404). */
export const latestRunKey = (caseId: string) => ["credit", caseId, "run"] as const;
export const latestRunQ = (caseId: string) =>
  queryOptions({ queryKey: latestRunKey(caseId), queryFn: () => orNull(api.latestAgentRun(caseId)) });
export const agentRunQ = (runId: string) =>
  queryOptions({ queryKey: ["agent-run", runId], queryFn: () => api.getAgentRun(runId) });
export const whatIfQ = (runId: string, amount: number, termMonths: number) =>
  queryOptions({
    queryKey: ["agent-run", runId, "what-if", amount, termMonths],
    queryFn: () => api.whatIf(runId, { amount, term_months: termMonths }),
    staleTime: 60_000,
  });
export const marketQ = () => queryOptions({ queryKey: ["market"], queryFn: () => api.getMarket() });
export const metricsQ = () => queryOptions({ queryKey: ["metrics"], queryFn: () => api.getMetrics() });
