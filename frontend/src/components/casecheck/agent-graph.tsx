import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, FileText, Loader2, Lock, RefreshCw, Workflow, XCircle } from "lucide-react";
import type { Evidence } from "@/lib/types";
import type { AgentId, AgentRun, AgentState } from "@/lib/agent-types";
import { activitySummary } from "@/lib/activity-copy";
import { cn } from "@/lib/utils";
import { Panel, Tag } from "./hud";
import { Timeline } from "./timeline";
import { MemoView } from "./insights";
import { RulesTable } from "./run-panels";

const GROUPS: { title: string; agents: AgentId[] }[] = [
  { title: "Documente și verificări", agents: ["completeness", "financials", "cashflow", "kyb"] },
  { title: "Analiză și recomandare", agents: ["analyst", "policy", "memo", "critic"] },
];
const NAMES: Partial<Record<AgentId, string>> = {
  completeness: "Verificarea documentelor", financials: "Situații financiare", cashflow: "Fluxuri de numerar", kyb: "Verificarea companiei",
  analyst: "Analist financiar", policy: "Reguli de credit", memo: "Nota de credit", critic: "Controlul analizei",
};
const metricLabel = (label:string) => label.replace("la Banca Demo", "la bancă");
const ICON = { idle: CircleDashed, running: Loader2, done: CheckCircle2, stale: RefreshCw, failed: XCircle, blocked: Lock };
const LABEL: Record<AgentState, string> = { idle: "În așteptare", running: "În lucru", done: "Finalizat", stale: "Necesită actualizare", failed: "Procesare eșuată", blocked: "Blocat" };
const TONE = { idle: "neutral", running: "agent", done: "success", stale: "warning", failed: "danger", blocked: "danger" } as const;

/** Presentation only: the server remains the source of status, chronology and results. */
export function AgentGraph({ run, docNames = {}, onSource, onRisk, onEvidence, initialAgent }: { run: AgentRun; docNames?: Record<string, string>; onSource?: (factId: string) => void; onRisk?: () => void; onEvidence?: (ev:Evidence,label:string)=>void; initialAgent?:AgentId|null }) {
  const [selected, setSelected] = useState<AgentId | null>(initialAgent??null);
  useEffect(()=>{if(selected)document.getElementById("agent-result")?.scrollIntoView({block:"nearest"});},[selected]);
  const ids = GROUPS.flatMap(g => g.agents);
  const completed = run.agents.filter(a => ids.includes(a.id) && a.status === "done").length;
  const running = run.agents.filter(a => a.status === "running");
  const card = run.agents.find(a => a.id === selected);
  const steps = run.steps.filter(s => s.agent === selected);
  const issues = run.board.issues.filter(i => i.agent === selected && i.status !== "resolved");
  const facts = run.board.facts.filter(f => f.agent === selected);
  const metrics = run.board.metrics.filter(m => m.agent === selected);

  const coordination = run.status === "RUNNING" ? "Coordonare în curs" : run.status === "FAILED" ? "Analiză întreruptă" : !run.is_current ? "Analiză de actualizat" : "Coordonare încheiată";
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-5 py-4">
      <div className="flex items-center gap-3"><Workflow className="h-5 w-5 text-agent-text" aria-hidden /><div><h2 className="font-medium">{coordination}</h2><p className="text-sm text-muted-foreground">{running.length ? running.map(a => NAMES[a.id] ?? a.title).join(" · ") : "Agenții verifică documentele și pregătesc recomandarea."}</p></div></div>
      <span className="num text-sm text-muted-foreground">{completed} din {ids.length} verificări finalizate</span>
    </div>
    {run.status === "FAILED" && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger bg-danger-soft p-4 text-danger"><XCircle className="mt-1 h-4 w-4 shrink-0" />Procesarea a eșuat. Datele nu sunt considerate verificate. Consultă eroarea și reia analiza.</p>}
    {GROUPS.map(group => <section key={group.title} aria-label={group.title} className="space-y-3">
      <h2 className="text-lg font-medium">{group.title}</h2>
      <div className="agent-cards">{group.agents.map(id => {
        const a = run.agents.find(a => a.id === id);
        const state = a?.status ?? "idle";
        const Icon = ICON[state];
        const openIssues = run.board.issues.filter(i => i.agent === id && i.status !== "resolved");
        const blocking = openIssues.some(i => i.severity === "blocking");
        const attention = openIssues.some(i => i.severity === "warning");
        const stale = !run.is_current && state === "done";
        const tone = stale ? "warning" : state === "done" && blocking ? "danger" : state === "done" && attention ? "warning" : TONE[state];
        const summary = activitySummary(id, a?.last_summary ?? null, state);
        return <button key={id} className="agent-card flex flex-col gap-3" id={`agent-card-${id}`} aria-expanded={selected === id} aria-controls="agent-result" onClick={() => setSelected(selected === id ? null : id)}>
          <span className="flex w-full items-start justify-between gap-2"><span className="text-base font-semibold leading-snug">{NAMES[id]}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /></span>
          <Tag tone={tone}><Icon className={cn("h-3.5 w-3.5", state === "running" && "animate-spin")} aria-hidden />{stale ? "Necesită actualizare" : LABEL[state]}</Tag>
          <span className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{summary}</span>
          {openIssues.length > 0 && <span className={cn("mt-auto flex items-center gap-1.5 text-sm", blocking ? "text-danger" : "text-warning")}><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{openIssues.length} {openIssues.length === 1 ? "aspect de verificat" : "aspecte de verificat"}</span>}
        </button>;
      })}</div>
    </section>)}
    {selected && <section id="agent-result" aria-label={`Rezultat: ${NAMES[selected]}`} className="agent-detail space-y-4">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-medium">{NAMES[selected]}</h2><p className="mt-2 leading-relaxed">{activitySummary(selected, card?.last_summary ?? null, card?.status)}</p></div><button onClick={() => {document.getElementById(`agent-card-${selected}`)?.focus();setSelected(null);}} className="shrink-0 px-3 py-2 text-sm text-muted-foreground">Închide</button></div>
      {issues.map(i => <div key={i.id} className={cn("rounded-lg border p-3", i.severity === "blocking" ? "border-danger bg-danger-soft" : "border-warning bg-warning-soft")}><p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 shrink-0" />{i.title}</p><p className="mt-1 text-sm text-muted-foreground">{i.detail}</p></div>)}
      {metrics.length > 0 && <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(m => <div key={m.id} className="rounded-lg bg-surface-2 p-3"><dt className="text-sm text-muted-foreground">{metricLabel(m.label)}</dt><dd className="num mt-1 font-medium">{m.display}</dd></div>)}</dl>}
      {facts.length > 0 && <details><summary className="font-medium">Date și documente sursă ({facts.length})</summary><ul className="mt-3 space-y-3">{facts.map(f => <li key={f.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span>{f.label}</span><button className="inline-flex items-center gap-2 px-2 py-1 text-sm text-agent-text" onClick={() => onSource?.(f.id)}><FileText className="h-4 w-4" />{docNames[f.evidence.document_id] ?? "Document sursă"} · p. {f.evidence.page}</button></div><p className="mt-1 text-sm text-muted-foreground">„{f.evidence.quote}”</p></li>)}</ul></details>}
      {selected === "analyst" && onRisk && <button className="border px-3 py-2 text-agent-text" onClick={onRisk}>Vezi cazurile istorice și scenariile</button>}
      {selected === "policy" && <details><summary>Regulile evaluate</summary><RulesTable rules={run.board.rules} /></details>}
      {selected === "memo" && run.board.memo && <details><summary>Nota de credit completă</summary><MemoView run={run} /></details>}
      {metrics.some(m => m.sources.length) && <details><summary>Sursele calculelor</summary><div className="mt-3 space-y-3">{metrics.filter(m=>m.sources.length).map(m=><details key={m.id} className="rounded-lg border px-4 py-2"><summary className="text-sm font-medium">{metricLabel(m.label)} · {m.display}</summary><ul className="my-2 space-y-2">{m.sources.map((source,i)=><li key={i}><button className="text-left text-sm text-agent-text underline" onClick={()=>onEvidence?.(source,metricLabel(m.label))}>{docNames[source.document_id] ?? "Document"} · p. {source.page} · „{source.quote}”</button></li>)}</ul></details>)}</div></details>}

      <details className="technical-details"><summary>Detalii tehnice și execuții</summary><p className="py-2">Mod de procesare înregistrat: {run.mode_label}</p><p>{card?.runs ?? 0} execuții în această analiză</p><p className="my-2">{card?.last_summary}</p><Timeline steps={steps} technical /></details>
    </section>}
    <Panel title="Activitate recentă"><Timeline steps={run.steps} compact limit={5} /><details className="technical-details"><summary>Istoric complet și detalii tehnice ({run.steps.length})</summary><p className="py-2">Mod de procesare înregistrat: {run.mode_label}</p><Timeline steps={run.steps} technical /></details></Panel>
  </div>;
}
