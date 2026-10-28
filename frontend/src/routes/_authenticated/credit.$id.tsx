import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, FlaskConical, Loader2, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { caseQ, latestRunKey } from "@/lib/queries";
import { useLiveRun } from "@/lib/use-run";
import { REC_LABEL, REC_TONE, RUN_STATUS_META } from "@/lib/labels";
import { fmtInt, fmtRon } from "@/lib/format";
import { useUser } from "@/routes/_authenticated";
import { AgentGraph } from "@/components/casecheck/agent-graph";
import { Timeline } from "@/components/casecheck/timeline";
import { BudgetPanel, IssuesList, PlanPanel, RequestCard, RulesTable } from "@/components/casecheck/run-panels";
import { DecisionCockpit } from "@/components/casecheck/decision";
import { ReviewBatch } from "@/components/casecheck/review";
import { EvidenceLens, type CaseDoc } from "@/components/casecheck/evidence";
import { CashflowView, GroupView, MemoView } from "@/components/casecheck/insights";
import { Empty, HudLabel, Panel, Stat, Tag } from "@/components/casecheck/hud";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/credit/$id")({
  component: CreditCase,
});

const TABS = [
  { key: "agents", label: "Agenți" },
  { key: "review", label: "Revizie" },
  { key: "decision", label: "Decizie" },
  { key: "evidence", label: "Dovezi" },
  { key: "memo", label: "Memo" },
  { key: "group", label: "Grup & KYB" },
  { key: "cashflow", label: "Fluxuri" },
  { key: "history", label: "Istoric" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Seconds the human spends on review + decision while the page is visible and focused. */
function useActiveSeconds(active: boolean) {
  const total = useRef(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) total.current += 1;
    }, 1000);
    return () => clearInterval(t);
  }, [active]);
  return () => total.current;
}

function CreditCase() {
  const { id } = Route.useParams();
  const user = useUser();
  const qc = useQueryClient();
  const detail = useQuery(caseQ(id));
  const { run, query } = useLiveRun(id);
  const [tab, setTab] = useState<TabKey>("agents");
  const seconds = useActiveSeconds(tab === "review" || tab === "decision");
  const preparer = user.role === "manager" || user.role === "analyst";

  const start = useMutation({
    mutationFn: () => api.startAgentRun(id),
    onSuccess: (r) => { qc.setQueryData(latestRunKey(id), r); qc.invalidateQueries({ queryKey: ["credit-cases"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const redTeam = useMutation({
    mutationFn: () => api.redTeam(run!.id),
    onSuccess: (r) => { qc.setQueryData(latestRunKey(id), r); toast.error("Gardă: loan.approve a fost blocată de politică"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const meta = (detail.data as unknown as { meta?: Record<string, unknown> } | undefined)?.meta ?? {};
  const docs = (detail.data?.documents ?? []) as unknown as CaseDoc[];
  const docNames = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, d.filename])), [docs]);
  // Refresh the document list when the agents store new source snapshots or the client answers.
  const steps = run?.steps.length ?? 0;
  useEffect(() => { if (steps) qc.invalidateQueries({ queryKey: ["case", id, "detail"] }); }, [steps > 0 && run?.status, id, qc]);

  if (detail.isLoading || query.isLoading) return <div className="hud-label text-muted-foreground">Se încarcă dosarul…</div>;
  if (detail.isError) return <Empty>Dosarul nu a putut fi încărcat.</Empty>;

  const status = run ? RUN_STATUS_META[run.status] : null;
  const rec = run?.recommendation;
  const waitingDecision = run?.status === "AWAITING_DECISION";

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="space-y-3">
        <Link to="/" className="hud-label inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3 w-3" />Coada de lucru</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="truncate text-[32px] font-medium leading-none tracking-tight">{String(meta.company ?? detail.data?.title ?? "")}</h1>
            <div className="num flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
              <span>CUI {String(meta.cui ?? "")}</span><span>CAEN {String(meta.caen ?? "")}</span>
              <span>{String(meta.product ?? "")}</span><span className="text-foreground">{fmtRon(Number(meta.amount ?? 0))} · {String(meta.term_months ?? "")} luni</span>
              {meta.request_id ? <span>{String(meta.request_id)}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status && <Tag tone={status.tone} className={run?.status === "RUNNING" ? "animate-pulse" : undefined}>{status.label}</Tag>}
            {rec && <Tag tone={REC_TONE[rec.decision]}>{REC_LABEL[rec.decision]}{rec.proposed ? ` · ${fmtInt(rec.proposed.amount)}` : ""}</Tag>}
            {rec && waitingDecision && <Tag tone="human">{rec.level}</Tag>}
            {run && user.role !== "supervisor" && (
              <button onClick={() => redTeam.mutate()} disabled={redTeam.isPending} title="Trimite gărzii o acțiune interzisă, ca un planificator compromis"
                className="hud-label inline-flex items-center gap-1.5 border border-danger/60 px-2.5 py-2 text-danger hover:bg-danger-soft">
                <FlaskConical className="h-3.5 w-3.5" />Test de siguranță
              </button>
            )}
          </div>
        </div>
        {run && <p className="hud-label text-[10px] text-muted-foreground">{run.mode_label}</p>}
      </div>

      {!run ? (
        <Panel agent eyebrow="Agenții nu au pornit" title="Pornește pregătirea dosarului">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-[70ch] text-[13.5px] text-muted-foreground">
              Orchestratorul planifică, iar cei șapte agenți specializați verifică documentele, extrag situațiile financiare, reconciliază extrasele,
              investighează grupul și evaluează politica. Ce lipsește se cere clientului într-o singură cerere. Decizia rămâne umană.
            </p>
            <button onClick={() => start.mutate()} disabled={!preparer || start.isPending}
              className="inline-flex items-center gap-2 bg-agent px-5 py-3 text-[14px] font-medium text-agent-foreground disabled:opacity-50">
              {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Pornește agenții
            </button>
          </div>
          {!preparer && <p className="mt-3 text-[12px] text-warning">Agenții sunt porniți de managerul de relație sau de analistul de operațiuni.</p>}
        </Panel>
      ) : (
        <>
          <nav className="flex flex-wrap gap-px border-b" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={cn("relative -mb-px border-b-2 px-4 py-2.5 text-[13.5px]",
                  tab === t.key ? "border-agent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.label}
                {t.key === "decision" && waitingDecision && <span className="ml-2 inline-block h-1.5 w-1.5 bg-human align-middle" />}
                {t.key === "review" && waitingDecision && !run.steps.some((s) => s.agent === "human" && s.title.startsWith("Revizie")) && <span className="ml-2 inline-block h-1.5 w-1.5 bg-warning align-middle" />}
              </button>
            ))}
          </nav>

          {tab === "agents" && (
            <div className="grid gap-5 2xl:grid-cols-[1fr_440px] xl:grid-cols-[1fr_400px]">
              <div className="min-w-0 space-y-5">
                <Panel agent={run.status === "RUNNING"} eyebrow="Orchestrator → Analist financiar → 7 agenți → om" title="Rularea live" bodyClassName="p-0"
                  actions={<span className="num text-[11.5px] text-muted-foreground">{run.steps.length} pași</span>}>
                  <AgentGraph run={run} />
                </Panel>
                {run.requests.length > 0 && <RequestCard run={run} caseId={id} canAct={preparer} />}
                <div className="grid gap-5 lg:grid-cols-2">
                  <Panel eyebrow="Probleme" title="Ridicate și rezolvate de agenți"><IssuesList issues={run.board.issues} /></Panel>
                  <Panel eyebrow="Agent Politică" title="Reguli de creditare (date, nu prompt)"><RulesTable rules={run.board.rules} /></Panel>
                </div>
              </div>
              <div className="min-w-0 space-y-5">
                <Panel eyebrow="Buget" title="Limitele segmentului"><BudgetPanel run={run} /></Panel>
                <Panel eyebrow="Plan" title="Ce a decis orchestratorul"><PlanPanel run={run} /></Panel>
                <Panel eyebrow="Timeline" title="Pașii agenților, live" bodyClassName="max-h-[640px] overflow-y-auto p-3">
                  <Timeline steps={run.steps} />
                </Panel>
              </div>
            </div>
          )}
          {tab === "review" && <ReviewBatch run={run} caseId={id} canReview={preparer} docNames={docNames} />}
          {tab === "decision" && <DecisionCockpit run={run} caseId={id} user={user} humanSeconds={seconds} />}
          {tab === "evidence" && <EvidenceLens run={run} docs={docs} />}
          {tab === "memo" && <MemoView run={run} />}
          {tab === "group" && <GroupView run={run} />}
          {tab === "cashflow" && <CashflowView run={run} />}
          {tab === "history" && (
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <Panel eyebrow="Istoric complet" title={`${run.steps.length} pași · inclusiv deciziile gărzii`} bodyClassName="p-3"><Timeline steps={run.steps} /></Panel>
              <div className="space-y-5">
                <Panel eyebrow="Securitate" title="Garda și injecțiile">
                  <div className="grid grid-cols-2 gap-4">
                    <Stat label="Acțiuni blocate" value={run.board.security.refused_actions} tone={run.board.security.refused_actions ? "danger" : undefined} />
                    <Stat label="Injecții ignorate" value={run.board.security.injections.length} tone={run.board.security.injections.length ? "warning" : undefined} />
                  </div>
                  <p className="mt-3 flex gap-2 text-[12px] text-muted-foreground"><ShieldAlert className="h-4 w-4 shrink-0" />Aprobarea, respingerea, schimbarea politicii și ștergerea dovezilor sunt blocate în cod pentru orice agent.</p>
                </Panel>
                <Panel eyebrow="Dosar" title="Revizia cazului">
                  <HudLabel>Revizie curentă</HudLabel>
                  <div className="num mt-1 text-2xl">r{run.case_revision}</div>
                  <p className="mt-2 text-[12px] text-muted-foreground">{run.is_current ? "Analiza corespunde ultimei versiuni a dosarului." : "Dosarul s-a schimbat după analiză."}</p>
                </Panel>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
