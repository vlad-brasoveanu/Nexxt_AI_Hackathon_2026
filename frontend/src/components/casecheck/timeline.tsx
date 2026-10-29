import { AlertTriangle, CheckCircle2, ChevronRight, Gavel, Inbox, RefreshCw, ShieldAlert } from "lucide-react";
import type { AgentId, AgentStep } from "@/lib/agent-types";
import { AGENT_META, agentShort } from "@/lib/labels";
import { fmtClockTime, fmtMs } from "@/lib/format";
import { activityTitle } from "@/lib/activity-copy";
import { cn } from "@/lib/utils";
import { ModelChip } from "./hud";

export function Timeline({ steps, compact, limit, technical }: { steps: AgentStep[]; compact?: boolean; limit?: number; technical?: boolean }) {
  const dispatches = new Set<string>();
  const reruns = new Set<number>();
  for (const step of steps) {if(step.kind === "dispatch"){const key=`${step.agent}:${step.task??""}`;if(dispatches.has(key))reruns.add(step.seq);dispatches.add(key);}}
  const relevant = technical ? steps : steps.filter(s => reruns.has(s.seq) || ["result", "challenge", "refused", "request", "decision", "error"].includes(s.kind) || s.agent === "human" || s.agent === "client");
  const shown = [...relevant].reverse().slice(0, limit ?? relevant.length);
  return <ol className="space-y-2" aria-live="polite" aria-relevant="additions text">
    {!shown.length && <li className="py-3 text-sm text-muted-foreground">Activitatea apare pe măsură ce analiza avansează.</li>}
    {shown.map(step => {
      const failed = step.status === "failed" || step.status === "refused" || step.kind === "error";
      const warning = step.status === "warning" || step.kind === "challenge";
      const Icon = failed ? ShieldAlert : warning ? AlertTriangle : step.kind === "decision" ? Gavel : step.kind === "request" ? Inbox : step.kind === "result" ? CheckCircle2 : step.kind === "dispatch" ? RefreshCw : ChevronRight;
      return <li key={step.seq} className={cn("rounded-lg border px-4 py-3", failed && "border-danger bg-danger-soft", warning && "border-warning/50 bg-warning-soft")}>
        <div className="flex items-start gap-3"><Icon className={cn("mt-1 h-4 w-4 shrink-0", failed ? "text-danger" : warning ? "text-warning" : "text-success")} aria-hidden /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{agentShort(step.agent)}</span><time dateTime={step.created_at}>{fmtClockTime(step.created_at)}</time></div><p className="mt-1 break-words text-[15px]">{!technical && reruns.has(step.seq) ? `Reverificare: ${agentShort((step.task?.split(".")[0] && step.task.split(".")[0] in AGENT_META ? step.task.split(".")[0] : step.agent) as AgentId)}` : technical ? step.title : activityTitle(step)}</p>
          {technical && <details className="mt-2 text-sm text-muted-foreground"><summary>Detalii execuție</summary><div className="space-y-2 pt-2"><ModelChip model={step.model} /><p>{step.model ? `Procesare: ${step.model.mode} · ${step.model.provider}` : "Execuție fără model"}{step.duration_ms != null ? ` · ${fmtMs(step.duration_ms)}` : ""}</p>{step.model?.error && <p className="text-danger">{step.model.error}</p>}{step.thought && <p>{step.thought}</p>}<pre>{JSON.stringify(step.detail, null, 2)}</pre></div></details>}
          {!compact && !technical && warning && step.thought && <p className="mt-1 text-sm text-muted-foreground">{step.thought}</p>}
        </div></div>
      </li>;
    })}
  </ol>;
}
