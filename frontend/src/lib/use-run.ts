// Live view of a credit case's agent run: the latest run from the API, kept current through the event stream
// (server-sent events, with polling fallback inside api.subscribeRun). New steps are appended as they arrive;
// a status change refetches the whole run so the board, recommendation and requests stay consistent.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "./api";
import type { AgentRun, AgentStep } from "./agent-types";
import { latestRunKey, latestRunQ } from "./queries";

export function useLiveRun(caseId: string) {
  const qc = useQueryClient();
  const query = useQuery(latestRunQ(caseId));
  const run = query.data ?? null;
  const lastSeq = useRef(0);
  lastSeq.current = run?.steps.at(-1)?.seq ?? 0;

  const runId = run?.id;
  const live = run?.status === "RUNNING";
  useEffect(() => {
    if (!runId || !live) return;
    const refetch = () => qc.invalidateQueries({ queryKey: latestRunKey(caseId) });
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {if(pending)return;pending=setTimeout(()=>{pending=null;refetch();},120);};
    const onStep = (step: AgentStep) => {
      qc.setQueryData<AgentRun | null>(latestRunKey(caseId), (old) => {
        if (!old || old.id !== runId || old.steps.some((s) => s.seq === step.seq)) return old;
        return { ...old, steps: [...old.steps, step], updated_at: step.created_at };
      });
      // Dispatches also change the server agent status. Refresh them as well as results.
      refresh();
    };
    const onRun = () => refetch();
    const unsubscribe=api.subscribeRun(runId,lastSeq.current,onStep,onRun);
    return ()=>{unsubscribe();if(pending)clearTimeout(pending);};
  }, [runId, live, caseId, qc]);

  return { run, query };
}
