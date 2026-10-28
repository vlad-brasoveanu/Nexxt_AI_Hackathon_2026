// Side panels of the live run: budget, plan, the consolidated client request, issues and rules.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleDot, CircleSlash, Inbox, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import type { AgentRun, Issue, RuleResult } from "@/lib/agent-types";
import { api } from "@/lib/api";
import { OUTCOME_RULE_LABEL, agentShort } from "@/lib/labels";
import { fmtClock, fmtClockTime } from "@/lib/format";
import { latestRunKey } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { HudLabel, Meter, Panel, Tag } from "./hud";

export function BudgetPanel({ run }: { run: AgentRun }) {
  const b = run.budget;
  const left = Math.max(0, b.limit - b.used);
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between"><HudLabel>Buget sarcini</HudLabel><span className="num text-xs">{b.used}/{b.limit}</span></div>
        <Meter value={left} max={b.limit} tone={left <= 3 ? "danger" : left <= 6 ? "warning" : "agent"} label="Buget rămas" />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between"><HudLabel>Timp segment</HudLabel><span className="num text-xs">{fmtClock(b.elapsed_s)}</span></div>
        <Meter value={Math.max(0, b.deadline_s - b.elapsed_s)} max={b.deadline_s} label="Timp rămas" />
      </div>
    </div>
  );
}

export function PlanPanel({ run }: { run: AgentRun }) {
  const items = run.plan.slice(-9);
  return (
    <ol className="space-y-1">
      {items.map((p, i) => {
        const Icon = p.status === "done" ? CircleCheck : p.status === "running" ? Loader2 : p.status === "pending" ? CircleDot : CircleSlash;
        return (
          <li key={`${p.task}-${i}`} className="flex items-start gap-2 text-[14px]">
            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", p.status === "done" && "text-success", p.status === "running" && "animate-spin text-agent-text",
              p.status === "pending" && "text-muted-foreground", (p.status === "skipped" || p.status === "refused") && "text-danger")} />
            <div className="min-w-0">
              <span className="num text-[13px]">{p.task}</span>
              <span className="ml-2 text-muted-foreground">{agentShort(p.agent)}</span>
              {p.why && <div className="truncate text-[13px] text-muted-foreground" title={p.why}>{p.why}</div>}
            </div>
          </li>
        );
      })}
      {!items.length && <li className="text-sm text-muted-foreground">Planul apare după prima decizie a orchestratorului.</li>}
    </ol>
  );
}

export function RequestCard({ run, caseId, canAct }: { run: AgentRun; caseId: string; canAct: boolean }) {
  const qc = useQueryClient();
  const request = run.requests.at(-1);
  const simulate = useMutation({
    mutationFn: () => api.simulateClientResponse(request!.id),
    onSuccess: (r) => {
      qc.setQueryData(latestRunKey(caseId), r);
      toast.success("Clientul a răspuns prin portal: agenții reiau analiza.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!request) return null;
  const waiting = request.status === "SENT";
  return (
    <Panel agent={waiting} eyebrow={<span className="inline-flex items-center gap-1.5"><Inbox className="h-3 w-3" />Cerere consolidată · runda {request.round}</span>}
      title={request.status==="DRAFT" ? "Ciornă — verificare și trimitere manuală" : waiting ? "Solicitare trimisă de angajat" : "Clientul a răspuns"}
      actions={<Tag tone={waiting ? "warning" : "success"}>{request.status==="DRAFT" ? "Necesită verificare" : waiting ? "Așteaptă clientul" : "Răspuns primit"}</Tag>}>
      <ul className="space-y-2">
        {request.items.map((item) => (
          <li key={item.code} className="flex gap-2.5 text-[15px]">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0", waiting ? "bg-warning" : "bg-success")} />
            <div><div>{item.title}</div><div className="mt-0.5 text-[13px] text-muted-foreground">{item.reason}</div></div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[13px] text-muted-foreground">
        <span className="num">{request.channel} · {request.status==="DRAFT" ? "pregătită" : "trimisă"} {fmtClockTime(request.sent_at)}</span>
        {waiting && canAct && (
          <button onClick={() => simulate.mutate()} disabled={simulate.isPending}
            className="inline-flex items-center gap-2 border border-agent-border bg-agent-soft px-3 py-1.5 text-[14px] text-agent-text hover:bg-agent hover:text-agent-foreground disabled:opacity-60">
            {simulate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Simulează răspunsul clientului
          </button>
        )}
      </div>
      <details className="mt-2 text-[14px] text-muted-foreground">
        <summary className="hud-label py-1">Mesajul solicitării</summary>
        <p className="mt-1 whitespace-pre-line border-l-2 border-border pl-3">{request.message}</p>
      </details>
    </Panel>
  );
}

const SEVERITY_TONE = { info: "info", warning: "warning", blocking: "danger" } as const;

export function IssuesList({ issues }: { issues: Issue[] }) {
  const sorted = [...issues].sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved"));
  if (!sorted.length) return <p className="text-sm text-muted-foreground">Nicio problemă ridicată de agenți.</p>;
  return (
    <ul className="divide-y">
      {sorted.map((i) => (
        <li key={i.id} className={cn("py-2.5", i.status === "resolved" && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={i.status === "resolved" ? "success" : SEVERITY_TONE[i.severity]}>{i.status === "resolved" ? "rezolvat" : i.status === "requested" ? "cerut clientului" : i.severity === "blocking" ? "blocant" : "atenție"}</Tag>
            <span className="hud-label text-[12px] text-muted-foreground">{agentShort(i.agent)}</span>
          </div>
          <div className="mt-1 text-[15px]">{i.title}</div>
          <div className="mt-0.5 text-[14px] text-muted-foreground">{i.resolution ?? i.detail}</div>
        </li>
      ))}
    </ul>
  );
}

const RULE_TONE = { PASS: "success", FAIL: "danger", UNKNOWN: "warning", WARN: "warning" } as const;

export function RulesTable({ rules }: { rules: RuleResult[] }) {
  if (!rules.length) return <p className="text-sm text-muted-foreground">Agentul Politică nu a evaluat încă dosarul.</p>;
  return (
    <div className="divide-y border">
      {rules.map((r) => (
        <div key={r.rule_id} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-3 py-2">
          <span className="num text-[13px] text-muted-foreground">{r.rule_id}</span>
          <div className="min-w-0">
            <div className="truncate text-[15px]">{r.title}</div>
            <div className="truncate text-[13px] text-muted-foreground" title={r.detail}>{r.detail}</div>
          </div>
          <div className="flex items-center gap-2">
            {r.value && <span className="num text-[14px]">{r.value}</span>}
            {r.threshold && <span className="num text-[11px] text-muted-foreground">{r.threshold}</span>}
            <Tag tone={RULE_TONE[r.outcome]}>{OUTCOME_RULE_LABEL[r.outcome]}</Tag>
          </div>
        </div>
      ))}
    </div>
  );
}
