import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronLeft, FileText, Loader2, Play, Sparkles, CheckCheck } from "lucide-react";
import { api, ApiError, isMock } from "@/lib/api";
import { mockDocPages } from "@/lib/mock";
import { caseQ, documentQ, factsQ, findingsQ, proposalQ, runsQ, traceQ } from "@/lib/queries";
import {
  DISPOSITION, dispKey, fieldLabel, fmtDateTime, KIND_LABEL, OUTCOME, OUTCOME_ORDER, parseTs, ROLE_LABEL, shortSha, todayIso,
} from "@/lib/labels";
import type { CaseDetail, Doc, Evidence, Fact, Run, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, DispositionBadge, Empty, Excerpt, Guarded, Mono, Pill, ReadOnlyBadge } from "@/components/casecheck/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "../_authenticated";

type Tab = "documente" | "extragere" | "verificari" | "istoric";
type Search = { tab?: Tab | undefined; doc?: string | undefined; page?: number | undefined };

export const Route = createFileRoute("/_authenticated/cases/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: ["documente", "extragere", "verificari", "istoric"].includes(s["tab"] as string) ? (s["tab"] as Tab) : undefined,
    doc: typeof s["doc"] === "string" ? s["doc"] : undefined,
    page: s["page"] ? Number(s["page"]) || undefined : undefined,
  }),
  component: CasePage,
});

const ms = (v: number) => (v >= 10 ? Math.round(v).toString() : v.toFixed(2));

function useMutationErrors(caseId: string) {
  const qc = useQueryClient();
  return (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) {
      toast.error("Dosarul s-a modificat. Reîncarcă.");
      qc.invalidateQueries({ queryKey: ["case", caseId] });
    } else if (e instanceof ApiError && e.status === 403) {
      toast.error("Acțiune nepermisă pentru rolul dumneavoastră.");
    } else if (e instanceof ApiError && e.status === 401) {
      toast.error("Sesiunea a expirat.");
      qc.invalidateQueries({ queryKey: ["session"] });
    } else {
      toast.error(e instanceof ApiError ? e.detail || `Eroare ${e.status}` : "A apărut o eroare.");
    }
  };
}

function CasePage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const user = useUser();
  const c = useQuery(caseQ(id));
  const runs = useQuery(runsQ(id));
  const facts = useQuery(factsQ(id));
  const tab = search.tab ?? "documente";
  const setSearch = (s: Search) => nav({ search: (p) => ({ ...p, ...s }), replace: true });

  if (c.isLoading) return <Empty>Se încarcă dosarul…</Empty>;
  if (c.isError || !c.data) return <Empty>Dosarul nu a putut fi încărcat.</Empty>;
  const cs = c.data;
  const latest = runs.data?.[0];

  return (
    <div className="space-y-4">
      <Link to="/kyc" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3 w-3" /> Dosare KYC</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{cs.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Mono>{cs.id}</Mono> · <span>Revizia <Mono className="text-foreground">r{cs.revision}</Mono></span> · <span>{cs.documents.length} documente</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DispositionBadge d={latest?.result.disposition} />
          {latest?.is_current === false && <span className="text-xs text-warning">Neactualizat</span>}
          <Pill tone="neutral">{ROLE_LABEL[user.role]}</Pill>
          {user.role === "supervisor" && <ReadOnlyBadge />}
        </div>
      </header>
      <Tabs value={tab} onValueChange={(v) => setSearch({ tab: v as Tab })}>
        <TabsList>
          <TabsTrigger value="documente">Documente</TabsTrigger>
          <TabsTrigger value="extragere">Extragere AI</TabsTrigger>
          <TabsTrigger value="verificari">Verificări</TabsTrigger>
          <TabsTrigger value="istoric">Istoric</TabsTrigger>
        </TabsList>
        <TabsContent value="documente">
          <DocumentsTab cs={cs} facts={facts.data?.facts.facts ?? []} docId={search.doc} page={search.page} onSelect={(doc, page) => setSearch({ doc, page })} />
        </TabsContent>
        <TabsContent value="extragere"><ExtractionTab cs={cs} user={user} /></TabsContent>
        <TabsContent value="verificari">
          <ChecksTab cs={cs} user={user} hasFacts={!!facts.data} runs={runs.data ?? []} openEvidence={(e) => setSearch({ tab: "documente", doc: e.document_id, page: e.page })} />
        </TabsContent>
        <TabsContent value="istoric"><HistoryTab cs={cs} runs={runs.data ?? []} factsRev={facts.data?.revision} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Documente ---------------- */

function DocumentsTab({ cs, facts, docId, page, onSelect }: { cs: CaseDetail; facts: Fact[]; docId?: string | undefined; page?: number | undefined; onSelect: (doc: string, page?: number) => void }) {
  const doc = cs.documents.find((d) => d.id === docId) ?? cs.documents[0];
  const docFacts = facts.filter((f) => f.evidence.document_id === doc?.id);
  if (!doc) return <Empty>Niciun document.</Empty>;
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr_360px]">
      <div className="space-y-1">
        {cs.documents.map((d) => (
          <button key={d.id} onClick={() => onSelect(d.id, undefined)} className={cn("w-full rounded border bg-card px-3 py-2 text-left transition-colors hover:bg-muted", d.id === doc.id && "border-primary ring-1 ring-primary")}>
            <div className="flex items-center gap-1.5 text-sm font-medium"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{KIND_LABEL[d.kind]}</div>
            <div className="truncate text-xs text-muted-foreground">{d.filename}</div>
            <Mono>{shortSha(d.sha256)}</Mono>
          </button>
        ))}
      </div>
      <PdfViewer doc={doc} page={page ?? 1} />
      <Card title="Dovezi" actions={<Mono>{docFacts.length} fapte</Mono>}>
        {docFacts.length === 0 ? <Empty>Nicio dovadă confirmată pentru acest document.</Empty> : (
          <ul className="space-y-2">
            {docFacts.map((f) => (
              <li key={f.id}>
                <button onClick={() => onSelect(doc.id, f.evidence.page)} className={cn("w-full rounded border p-2.5 text-left hover:bg-muted", page === f.evidence.page && "border-primary/60")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{fieldLabel(f.field)}</span>
                    <Mono>p. {f.evidence.page}</Mono>
                  </div>
                  <div className="text-sm font-medium">{f.value}</div>
                  <div className="mt-1"><Excerpt text={doc.pages[f.evidence.page - 1]} start={f.evidence.start} end={f.evidence.end} /></div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PdfViewer({ doc, page }: { doc: Doc; page: number }) {
  if (isMock()) {
    const pages = mockDocPages(doc.id);
    return (
      <div className="flex h-[70vh] flex-col rounded-md border bg-muted">
        <div className="flex items-center justify-between border-b bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <span>{doc.filename}</span><span>Previzualizare demonstrativă · pagina {page}/{pages.length}</span>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="mx-auto max-w-xl rounded-sm border bg-card p-8 shadow-sm">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{pages[page - 1] ?? "Pagină inexistentă"}</pre>
          </div>
        </div>
      </div>
    );
  }
  return <BlobPdf doc={doc} page={page} />;
}

function BlobPdf({ doc, page }: { doc: Doc; page: number }) {
  const blob = useQuery(documentQ(doc.id));
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const u = URL.createObjectURL(blob.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob.data]);
  if (blob.isError) return <div className="flex h-[70vh] items-center justify-center rounded-md border bg-card"><Empty>Documentul nu a putut fi descărcat.</Empty></div>;
  if (!url) return <div className="flex h-[70vh] items-center justify-center rounded-md border bg-card"><Empty>Se încarcă documentul…</Empty></div>;
  return <iframe key={`${doc.id}-${page}`} title={doc.filename} src={`${url}#page=${page}&navpanes=0&view=FitH`} className="h-[70vh] w-full rounded-md border bg-card" />;
}

/* ---------------- Extragere AI ---------------- */

function ExtractionTab({ cs, user }: { cs: CaseDetail; user: User }) {
  const qc = useQueryClient();
  const onErr = useMutationErrors(cs.id);
  const prop = useQuery(proposalQ(cs.id));
  const [elapsed, setElapsed] = useState(0);
  const run = useMutation({
    mutationFn: () => api.runExtraction(cs.id),
    onSuccess: () => { toast.success("Extragere finalizată"); qc.invalidateQueries({ queryKey: ["case", cs.id] }); },
    onError: onErr,
  });
  const confirm = useMutation({
    mutationFn: () => api.confirmFacts(cs.id, cs.revision, prop.data!.facts),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["case", cs.id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      const fresh = qc.getQueryData<CaseDetail>(["case", cs.id, "detail"]);
      toast.success(`Fapte confirmate · revizia ${fresh?.revision ?? cs.revision + 1}`);
    },
    onError: onErr,
  });
  useEffect(() => {
    if (!run.isPending) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [run.isPending]);

  const p = prop.data;
  const docName = (id: string) => cs.documents.find((d) => d.id === id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Guarded user={user}>
          {(ro) => (
            <Button onClick={() => run.mutate()} disabled={ro || run.isPending}>
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Rulează extragerea AI
            </Button>
          )}
        </Guarded>
        {run.isPending && <span className="text-sm text-muted-foreground">Se extrag faptele din {cs.documents.length} documente… {elapsed}s (de obicei 5–15 s)</span>}
      </div>
      {run.isPending && <div className="h-1 overflow-hidden rounded bg-muted"><div className="h-full w-1/3 animate-pulse rounded bg-primary" style={{ width: `${Math.min(95, elapsed * 7)}%` }} /></div>}

      {prop.isLoading ? <Empty>Se încarcă…</Empty> : !p ? <Card><Empty>Nu există încă o propunere de extragere.</Empty></Card> : (
        <>
          <Card
            title="Ultima propunere"
            actions={
              <Guarded user={user}>
                {(ro) => (
                  <Button size="sm" onClick={() => confirm.mutate()} disabled={ro || confirm.isPending || p.status !== "COMPLETED"}>
                    <CheckCheck className="h-4 w-4" /> Confirmă faptele
                  </Button>
                )}
              </Guarded>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="neutral">{p.label}</Pill>
              <Pill tone={p.status === "COMPLETED" ? "success" : "danger"}>{p.status}</Pill>
              {!p.is_current && <Pill tone="warning"><AlertTriangle className="h-3 w-3" /> Propunere pentru o revizie anterioară (r{p.case_revision})</Pill>}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-4">
              <Meta k="Model" v={<Mono>{p.model}</Mono>} />
              <Meta k="Latență totală" v={`${(p.latency_ms / 1000).toFixed(1)} s`} />
              <Meta k="Versiune prompt" v={<Mono>{p.prompt_version}</Mono>} />
              <Meta k="Creat" v={fmtDateTime(p.created_at)} />
            </dl>
            {p.error && <p className="mt-2 text-sm text-danger">{p.error}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.calls.map((c) => (
                <span key={c.document_id} className="rounded border bg-muted px-2 py-0.5 text-xs">{KIND_LABEL[c.kind]} · <Mono>{ms(c.latency_ms)} ms</Mono></span>
              ))}
            </div>
          </Card>

          <Card title="Fapte propuse" actions={<Mono>{p.facts.facts.length}</Mono>}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="pb-2 font-medium">Câmp</th><th className="pb-2 font-medium">Valoare</th><th className="pb-2 font-medium">Document</th><th className="pb-2 font-medium">Pag.</th><th className="pb-2 font-medium w-[40%]">Citat</th></tr>
              </thead>
              <tbody>
                {p.facts.facts.map((f) => {
                  const d = docName(f.evidence.document_id);
                  return (
                    <tr key={f.id} className="border-t align-top">
                      <td className="py-2 pr-3 text-muted-foreground">{fieldLabel(f.field)}</td>
                      <td className="py-2 pr-3 font-medium">{f.value}</td>
                      <td className="py-2 pr-3">{d ? KIND_LABEL[d.kind] : <Mono>{f.evidence.document_id}</Mono>}</td>
                      <td className="py-2 pr-3"><Mono>{f.evidence.page}</Mono></td>
                      <td className="py-2"><Excerpt text={d?.pages[f.evidence.page - 1]} start={f.evidence.start} end={f.evidence.end} ctx={60} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card title="Elemente respinse" actions={<Mono>{p.rejected.length}</Mono>}>
            {p.rejected.length === 0 ? <Empty>Niciun element respins.</Empty> : (
              <ul className="space-y-1.5">
                {p.rejected.map((r, i) => (
                  <li key={i} className={cn("rounded border px-3 py-2 text-sm", /nu apare/i.test(r.reason) ? "border-danger/30 bg-danger-soft" : "border-warning/30 bg-warning-soft")}>
                    <span className="font-medium">{fieldLabel(r.field ?? "")}</span> = <Mono className="text-foreground">{r.value || "—"}</Mono> · {KIND_LABEL[r.kind]}
                    <div className="text-xs text-muted-foreground">{r.reason}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}

/* ---------------- Verificări ---------------- */

function ChecksTab({ cs, user, hasFacts, runs, openEvidence }: { cs: CaseDetail; user: User; hasFacts: boolean; runs: Run[]; openEvidence: (e: Evidence) => void }) {
  const qc = useQueryClient();
  const onErr = useMutationErrors(cs.id);
  const [date, setDate] = useState(todayIso());
  const create = useMutation({
    mutationFn: () => api.createRun(cs.id, cs.revision, date),
    onSuccess: () => {
      toast.success("Verificări finalizate");
      qc.invalidateQueries({ queryKey: ["case", cs.id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: onErr,
  });
  const run = runs[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="evd" className="text-xs text-muted-foreground">Data evaluării</label>
          <Input id="evd" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Guarded user={user}>
          {(ro) => (
            <Button onClick={() => create.mutate()} disabled={ro || !hasFacts || create.isPending || !date}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Rulează verificările
            </Button>
          )}
        </Guarded>
        {!hasFacts && <span className="text-xs text-muted-foreground">Confirmați mai întâi faptele din „Extragere AI”.</span>}
      </div>
      {!run ? <Card><Empty>Nu există încă nicio rulare de verificări.</Empty></Card> : <RunView run={run} cs={cs} openEvidence={openEvidence} />}
    </div>
  );
}

const BANNER = { success: "border-success/40 bg-success-soft text-success", warning: "border-warning/40 bg-warning-soft text-warning", danger: "border-danger/40 bg-danger-soft text-danger", neutral: "border-neutral/40 bg-neutral-soft text-neutral" };

function RunView({ run, cs, openEvidence }: { run: Run; cs: CaseDetail; openEvidence: (e: Evidence) => void }) {
  const findings = useQuery(findingsQ(run.id));
  const [traceOpen, setTraceOpen] = useState(false);
  const trace = useQuery({ ...traceQ(run.id), enabled: traceOpen });
  const d = DISPOSITION[dispKey(run.result.disposition)]!;
  const list = findings.data ?? run.result.findings;
  const grouped = useMemo(() => OUTCOME_ORDER.map((o) => ({ o, items: list.filter((f) => f.outcome === o) })).filter((g) => g.items.length), [list]);

  return (
    <div className="space-y-4">
      <div className={cn("rounded-md border px-4 py-3", BANNER[d.tone])}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-base font-semibold">{d.label}</span>
          {run.is_current === false && <span className="flex items-center gap-1 text-xs"><AlertTriangle className="h-3 w-3" /> Rulare pentru revizia r{run.case_revision} — dosarul s-a modificat (r{cs.revision})</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-foreground/70">
          <span>{run.result.scope}</span>
          <span>Mod: <Mono>{run.result.processing_mode}</Mono></span>
          <span>Data evaluării: <Mono>{run.snapshot.evaluation_date}</Mono></span>
          <span>Flux: <Mono>{run.snapshot.workflow.id}@{run.snapshot.workflow.version}</Mono></span>
          <span>Rulare: <Mono>{run.id}</Mono></span>
        </div>
      </div>

      {grouped.map(({ o, items }) => (
        <div key={o} className="space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Pill tone={OUTCOME[o].tone}>{OUTCOME[o].label}</Pill> {items.length}</h4>
          {items.map((f) => (
            <div key={f.rule_id + (f.entity_id ?? "")} className="rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={OUTCOME[f.outcome].tone}>{OUTCOME[f.outcome].label}</Pill>
                <Mono className="text-foreground">{f.rule_id}</Mono>
                <Mono>{f.module_id}</Mono>
                <span className="text-xs text-muted-foreground">severitate: {f.severity}</span>
              </div>
              <p className="mt-1.5 text-sm">{f.explanation}</p>
              {f.required_action && f.required_action !== "—" && <p className="mt-1 text-sm"><span className="text-muted-foreground">Acțiune necesară: </span>{f.required_action}</p>}
              {f.evidence.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {f.evidence.map((e, i) => {
                    const doc = cs.documents.find((x) => x.id === e.document_id);
                    return (
                      <li key={i}>
                        <button onClick={() => openEvidence(e)} className="w-full rounded border bg-muted/50 px-2.5 py-1.5 text-left hover:bg-muted">
                          <div className="text-xs font-medium">{doc ? KIND_LABEL[doc.kind] : e.document_id} · p. {e.page} <Mono>{shortSha(e.sha256)}</Mono></div>
                          <Excerpt text={doc?.pages[e.page - 1]} start={e.start} end={e.end} ctx={60} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="rounded-md border bg-card">
        <button onClick={() => setTraceOpen((x) => !x)} className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold">
          Trace <ChevronDown className={cn("h-4 w-4 transition-transform", traceOpen && "rotate-180")} />
        </button>
        {traceOpen && (
          <div className="border-t p-4">
            {trace.isLoading ? <Empty>Se încarcă…</Empty> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-1 font-medium">Pas</th><th className="pb-1 font-medium">Modul</th><th className="pb-1 font-medium">Reguli</th><th className="pb-1 font-medium">Stare</th><th className="pb-1 font-medium text-right">Durată</th></tr></thead>
                <tbody>
                  {(trace.data ?? []).map((s) => (
                    <tr key={s.step_id} className="border-t">
                      <td className="py-1.5"><Mono>{s.step_id}</Mono></td>
                      <td className="py-1.5"><Mono className="text-foreground">{s.module.id}@{s.module.version}</Mono></td>
                      <td className="py-1.5"><Mono>{s.module.rule_ids.join(", ")}</Mono></td>
                      <td className="py-1.5"><Pill tone={s.status === "SUCCEEDED" ? "success" : "danger"}>{s.status}</Pill>{s.error_code && <Mono className="ml-2 text-danger">{s.error_code}</Mono>}</td>
                      <td className="py-1.5 text-right"><Mono>{ms(s.duration_ms)} ms</Mono></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Istoric ---------------- */

function HistoryTab({ cs, runs, factsRev }: { cs: CaseDetail; runs: Run[]; factsRev?: number | undefined }) {
  const prop = useQuery(proposalQ(cs.id));
  type Ev = { at?: string | undefined; title: string; detail: React.ReactNode; tone: "success" | "warning" | "danger" | "neutral" };
  const events: Ev[] = [];
  events.push({ at: cs.created_at, title: "Dosar creat", detail: <Mono>{cs.id}</Mono>, tone: "neutral" });
  cs.documents.forEach((d) => events.push({ at: cs.created_at, title: `Document încărcat · ${KIND_LABEL[d.kind]}`, detail: <>{d.filename} <Mono>{shortSha(d.sha256)}</Mono></>, tone: "neutral" }));
  if (prop.data) events.push({ at: prop.data.created_at, title: "Propunere extragere AI", detail: <>{prop.data.model} · {(prop.data.latency_ms / 1000).toFixed(1)} s · {prop.data.facts.facts.length} fapte</>, tone: "neutral" });
  if (factsRev) events.push({ at: undefined, title: "Fapte confirmate", detail: <>Revizia <Mono>r{factsRev}</Mono></>, tone: "success" });
  runs.forEach((r) => {
    const d = DISPOSITION[dispKey(r.result.disposition)]!;
    events.push({ at: r.created_at, title: `Verificări rulate · ${d.label}`, detail: <>Data evaluării <Mono>{r.snapshot.evaluation_date}</Mono> · revizia <Mono>r{r.case_revision}</Mono> · {r.is_current === false ? <span className="text-warning">neactualizat</span> : "curent"}</>, tone: d.tone });
  });
  // Confirmed facts have no timestamp: place just after the proposal.
  const ts = (e: Ev) => (e.at ? parseTs(e.at) : prop.data ? parseTs(prop.data.created_at) + 1 : 0);
  events.sort((a, b) => ts(b) - ts(a));
  const DOT = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", neutral: "bg-neutral" };

  return (
    <Card>
      <ol className="relative space-y-4 border-l pl-5">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span className={cn("absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card", DOT[e.tone])} />
            <div className="flex flex-wrap items-baseline gap-2"><span className="text-sm font-medium">{e.title}</span><span className="text-xs text-muted-foreground">{e.at ? fmtDateTime(e.at) : "—"}</span></div>
            <div className="text-xs text-muted-foreground">{e.detail}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
