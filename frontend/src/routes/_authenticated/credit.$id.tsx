import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, FlaskConical, Loader2, Play, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api, isMock } from "@/lib/api";
import { caseQ, latestRunKey } from "@/lib/queries";
import { useLiveRun } from "@/lib/use-run";
import { RUN_STATUS_META } from "@/lib/labels";
import { fmtRon } from "@/lib/format";
import type { ReviewFact } from "@/lib/agent-types";
import { useUser } from "@/routes/_authenticated";
import { AgentGraph } from "@/components/casecheck/agent-graph";
import { Timeline } from "@/components/casecheck/timeline";
import { IssuesList, RequestCard, RulesTable } from "@/components/casecheck/run-panels";
import { RiskPlanner } from "@/components/casecheck/risk-planner";
import { DocumentIntake } from "@/components/casecheck/document-intake";
import { DecisionCockpit } from "@/components/casecheck/decision";
import { ReviewBatch } from "@/components/casecheck/review";
import { PdfFrame, TextFrame, type CaseDoc } from "@/components/casecheck/evidence";
import { CashflowView, GroupView, MemoView } from "@/components/casecheck/insights";
import { FlowBar, nextAction, type CaseTab } from "@/components/casecheck/flow";
import { Empty, Panel, Tag } from "@/components/casecheck/hud";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/credit/$id")({
  component: CreditCase,
});

const TABS: { key: CaseTab; label: string }[] = [
  { key: "agents", label: "1. Analiza agenților" },
  { key: "review", label: "2. Verificarea faptelor" },
  { key: "risk", label: "3. Risk Planner" },
  { key: "decision", label: "4. Decizie" },
  { key: "profile", label: "Profilul firmei" },
];

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
  const [tab, setTab] = useState<CaseTab>("agents");
  const [focused, setFocused] = useState<ReviewFact | null>(null);
  const seconds = useActiveSeconds(tab === "review" || tab === "decision");
  const preparer = user.permissions?.edit_case ?? (user.role === "manager" || user.role === "analyst");

  const start = useMutation({
    mutationFn: () => api.startAgentRun(id),
    onSuccess: (r) => { qc.setQueryData(latestRunKey(id), r); qc.invalidateQueries({ queryKey: ["credit-cases"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const client = useMutation({
    mutationFn: () => api.simulateClientResponse(run!.requests.at(-1)!.id),
    onSuccess: (r) => { qc.setQueryData(latestRunKey(id), r); qc.invalidateQueries({queryKey:["case",id]}); toast.success("Documente primite. Apasă Reanalizează dosarul."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendDraft = useMutation({mutationFn:()=>api.sendClientRequest(run!.requests.at(-1)!.id),onSuccess:()=>{qc.invalidateQueries({queryKey:latestRunKey(id)});qc.invalidateQueries({queryKey:["credit-cases"]});toast.success("Solicitare trimisă prin portalul simulat.");},onError:(e:Error)=>toast.error(e.message)});
  const redTeam = useMutation({
    mutationFn: () => api.redTeam(run!.id),
    onSuccess: (r) => { qc.setQueryData(latestRunKey(id), r); toast.error("Garda a blocat aprobarea cerută de un agent: doar omul poate aproba."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const meta = (detail.data as unknown as { meta?: Record<string, unknown> } | undefined)?.meta ?? {};
  const docs = (detail.data?.documents ?? []) as unknown as CaseDoc[];
  const byId = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, d])), [docs]);
  const docNames = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, d.filename])), [docs]);
  const status = run?.status;
  useEffect(() => { if (status) qc.invalidateQueries({ queryKey: ["case", id, "detail"] }); }, [status, id, qc]);

  if (detail.isLoading || query.isLoading) return <div className="text-muted-foreground">Se încarcă dosarul…</div>;
  if (detail.isError) return <Empty>Dosarul nu a putut fi încărcat.</Empty>;

  const next = nextAction(run, user);
  const statusMeta = run ? RUN_STATUS_META[run.status] : null;
  const doc = focused ? byId[focused.evidence.document_id] : undefined;

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <div className="space-y-3">
        <Link to="/" className="inline-flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" />Sarcinile mele</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className="truncate text-[30px] font-medium leading-tight tracking-tight">{String(meta.company ?? detail.data?.title ?? "")}</h1>
            <p className="text-[15px] text-muted-foreground">
              {String(meta.product ?? "")}: <span className="num text-foreground">{fmtRon(Number(meta.amount ?? 0))}</span> pe {String(meta.term_months ?? "")} luni
              <span className="mx-2">·</span>CUI <span className="num">{String(meta.cui ?? "")}</span>
            </p>
          </div>
          {statusMeta && <Tag tone={statusMeta.tone} className={cn("text-[13px]", status === "RUNNING" && "animate-pulse")}>{statusMeta.label}</Tag>}
        </div>
      </div>


      <FlowBar run={run} />
      <DocumentIntake caseId={id} revision={detail.data?.revision??0} documents={docs} canUpload={preparer && run?.status!=="RUNNING"} />

      {run && !run.is_current && <p role="alert" className="border border-warning bg-warning-soft px-4 py-3 text-[15px] text-warning">Documentele s-au modificat după această analiză. Rezultatul trebuie actualizat înainte de decizie.</p>}
      <div className={cn("flex flex-wrap items-center justify-between gap-4 border-2 px-5 py-4", next.mine ? "border-human bg-surface-1" : "border-border bg-card")}>
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{next.mine ? "Ce ai de făcut acum" : "Unde e dosarul"}</div>
          <div className="mt-1 text-[19px] font-medium">{next.title}</div>
          <div className="mt-0.5 text-[15px] text-muted-foreground">{next.detail}</div>
        </div>
        {next.action === "start" && (
          <button onClick={() => start.mutate()} disabled={start.isPending} className="inline-flex items-center gap-2 bg-agent px-5 py-3 text-[16px] font-medium text-agent-foreground disabled:opacity-50">
            {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{run ? "Reanalizează dosarul" : "Analizează documentele"}
          </button>
        )}
        {next.action === "send" && <button onClick={()=>sendDraft.mutate()} disabled={sendDraft.isPending||!run?.is_current} className="bg-human px-5 py-3 text-human-foreground disabled:opacity-50">Am verificat ciorna · trimite solicitarea</button>}
        {next.action === "client" && (
          <button onClick={() => client.mutate()} disabled={client.isPending} className="inline-flex items-center gap-2 border-2 border-agent-border px-5 py-3 text-[16px] text-agent-text hover:bg-agent-soft disabled:opacity-50">
            {client.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Simulează răspunsul clientului
          </button>
        )}
        {next.mine && next.tab && next.tab !== tab && !next.action && (
          <button onClick={() => setTab(next.tab!)} className="inline-flex items-center gap-2 bg-human px-5 py-3 text-[16px] font-medium text-human-foreground">
            Mergi la {TABS.find((t) => t.key === next.tab)?.label.replace(/^\d\. /, "").toLowerCase()}<ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {run && (
        <>
          <nav className="flex flex-wrap gap-1 border-b" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={cn("-mb-px border-b-2 px-4 py-3 text-[16px]",
                  tab === t.key ? "border-agent font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "agents" && (
            <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
              <div className="min-w-0 space-y-5">
                <Panel title="Cum lucrează agenții" eyebrow={run.mode_label} bodyClassName="p-0"
                  actions={user.role !== "supervisor" ? (
                    <button onClick={() => redTeam.mutate()} disabled={redTeam.isPending} title="Trimite gărzii o cerere de aprobare, ca un agent compromis" className="inline-flex items-center gap-1.5 border border-danger/60 px-3 py-1.5 text-[14px] text-danger hover:bg-danger-soft"><FlaskConical className="h-4 w-4" />Test de siguranță</button>
                  ) : undefined}>
                  <AgentGraph run={run} />
                </Panel>
                {run.requests.length > 0 && <RequestCard run={run} caseId={id} canAct={false} />}
                <Panel title="Probleme găsite de agenți"><IssuesList issues={run.board.issues} /></Panel>
              </div>
              <Panel title="Pașii agenților" eyebrow={`${run.steps.length} pași · cel mai recent sus`} bodyClassName="max-h-[900px] overflow-y-auto p-3"><Timeline steps={run.steps} /></Panel>
            </div>
          )}

          {tab === "review" && (
            <div className="space-y-4">
              {run.board.security.injections.map((i) => (
                <div key={`${i.document_id}-${i.quote.slice(0, 16)}`} className="flex gap-3 border border-warning bg-warning-soft px-4 py-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <div className="text-[15px]">
                    <div className="font-medium text-warning">Conținut suspect ignorat în {i.filename}</div>
                    <details className="mt-1 text-[14px] text-muted-foreground"><summary className="cursor-pointer">Vezi textul ignorat</summary><p className="mt-2">„{i.quote}”</p></details>
                  </div>
                </div>
              ))}
              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <ReviewBatch run={run} caseId={id} canReview={preparer} docNames={docNames} onFocus={setFocused} />
                <Panel title={doc ? doc.filename : "Documentul sursă"} eyebrow={focused ? `${focused.label} · pagina ${focused.evidence.page}` : "Selectează un fapt"} className="xl:sticky xl:top-4 xl:self-start">
                  {doc && focused ? (
                    !isMock() && (doc.media_type === "application/pdf" || doc.filename.toLowerCase().endsWith(".pdf"))
                      ? <><p className="mb-2 text-[14px]">Valoarea căutată: <mark className="num">{focused.evidence.quote}</mark></p><PdfFrame doc={doc} page={focused.evidence.page} /></>
                      : <>{isMock() && <p className="mb-2 text-[14px] text-muted-foreground">Document demonstrativ · valoarea este evidențiată.</p>}<TextFrame doc={doc} ev={focused.evidence} /></>
                  ) : <Empty>Alege un rând din listă ca să vezi documentul din care provine.</Empty>}
                </Panel>
              </div>
            </div>
          )}

          {tab === "risk" && <RiskPlanner run={run} caseId={id} onReview={()=>setTab("review")} />}
          {tab === "decision" && (
            <div className="space-y-5">
              <DecisionCockpit run={run} caseId={id} user={user} humanSeconds={seconds} />
              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Regulile de credit verificate" eyebrow={run.recommendation ? `Politica ${run.recommendation.policy_version}` : undefined}><RulesTable rules={run.board.rules} /></Panel>
                <details className="border bg-card" open={false}>
                  <summary className="cursor-pointer px-4 py-3 text-[16px] font-medium">Nota de credit scrisă de agenți</summary>
                  <div className="border-t p-4"><MemoView run={run} /></div>
                </details>
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div className="space-y-5">
              <GroupView run={run} />
              <CashflowView run={run} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
