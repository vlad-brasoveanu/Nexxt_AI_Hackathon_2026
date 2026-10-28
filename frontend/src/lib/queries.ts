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
