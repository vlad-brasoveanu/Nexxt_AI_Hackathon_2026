// Evidence lens: every metric with the literal spans it was derived from, next to the stored document version.
// PDFs open at the cited page; text sources (bank export, agent lookups) show the quoted span highlighted.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, FileText, ShieldAlert } from "lucide-react";
import type { AgentRun, Metric } from "@/lib/agent-types";
import type { Evidence } from "@/lib/types";
import { agentShort, kindLabel, shortSha } from "@/lib/labels";
import { documentQ } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Empty, HudLabel, Panel, Tag } from "./hud";

export type CaseDoc = { id: string; kind: string; filename: string; sha256: string; pages: string[]; media_type?: string; source?: string };

function PdfFrame({ doc, page }: { doc: CaseDoc; page: number }) {
  const blob = useQuery(documentQ(doc.id));
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const u = URL.createObjectURL(blob.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob.data]);
  if (!url) return <Empty>Se încarcă documentul…</Empty>;
  return <iframe key={`${doc.id}-${page}`} title={doc.filename} src={`${url}#page=${page}&navpanes=0&view=FitH`} className="h-[64vh] w-full border bg-white" />;
}

function TextFrame({ doc, ev }: { doc: CaseDoc; ev: Evidence | null }) {
  const mark = useRef<HTMLElement>(null);
  useEffect(() => { mark.current?.scrollIntoView({ block: "center" }); }, [ev]);
  const page = doc.pages[(ev?.page ?? 1) - 1] ?? "";
  if (!ev || ev.document_id !== doc.id) return <pre className="num h-[64vh] overflow-auto border bg-surface-1 p-3 text-[11.5px] leading-relaxed">{page.slice(0, 20000)}</pre>;
  const from = Math.max(0, ev.start - 4000), to = Math.min(page.length, ev.end + 4000);
  return (
    <pre className="num h-[64vh] overflow-auto border bg-surface-1 p-3 text-[11.5px] leading-relaxed">
      {from > 0 && "…\n"}{page.slice(from, ev.start)}<mark ref={mark}>{page.slice(ev.start, ev.end)}</mark>{page.slice(ev.end, to)}{to < page.length && "\n…"}
    </pre>
  );
}

export function EvidenceLens({ run, docs }: { run: AgentRun; docs: CaseDoc[] }) {
  const metrics = run.board.metrics;
  const [docId, setDocId] = useState<string | null>(null);
  const [ev, setEv] = useState<Evidence | null>(null);
  const byId = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, d])), [docs]);
  const doc = (docId && byId[docId]) || docs[0];
  const pick = (e: Evidence) => { setDocId(e.document_id); setEv(e); };
  const isText = (d: CaseDoc) => d.media_type !== "application/pdf" && !d.filename.toLowerCase().endsWith(".pdf");

  return (
    <div className="space-y-5">
      {run.board.security.injections.map((i) => (
        <div key={`${i.document_id}-${i.quote.slice(0, 20)}`} className="flex gap-3 border border-warning bg-warning-soft px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="text-[13px]">
            <div className="font-medium text-warning">Instrucțiune pentru AI găsită și ignorată · {i.filename}</div>
            <p className="num mt-1 text-[12px] text-muted-foreground">„{i.quote}”</p>
            <p className="mt-1 text-[12px]">Documentele sunt tratate ca date: nicio valoare sau acțiune din acest text nu a fost preluată.</p>
          </div>
        </div>
      ))}
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <Panel eyebrow={`${metrics.length} indicatori · fiecare cu sursa`} title="Indicatori și dovezi" bodyClassName="p-0">
          <ul className="max-h-[70vh] divide-y overflow-y-auto">
            {metrics.map((m) => <MetricRow key={m.id} m={m} byId={byId} onPick={pick} active={ev} />)}
          </ul>
        </Panel>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {docs.map((d) => (
              <button key={d.id} onClick={() => { setDocId(d.id); setEv(null); }}
                className={cn("inline-flex max-w-[260px] items-center gap-1.5 border px-2.5 py-1.5 text-[12px]",
                  doc?.id === d.id ? "border-human bg-surface-2" : "border-border hover:border-border-strong",
                  d.source === "agent" && "border-dashed")}>
                {d.source === "agent" ? <Bot className="h-3.5 w-3.5 shrink-0 text-agent-text" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="truncate">{d.filename}</span>
              </button>
            ))}
          </div>
          {doc ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                <Tag>{kindLabel(doc.kind)}</Tag><span className="num">sha256 {shortSha(doc.sha256)}…</span>
                {ev && ev.document_id === doc.id && <span className="num">· p. {ev.page} · „{ev.quote}”</span>}
              </div>
              {isText(doc) ? <TextFrame doc={doc} ev={ev} /> : <PdfFrame doc={doc} page={ev?.document_id === doc.id ? ev.page : 1} />}
            </>
          ) : <Empty>Niciun document în dosar.</Empty>}
        </div>
      </div>
    </div>
  );
}

function MetricRow({ m, byId, onPick, active }: { m: Metric; byId: Record<string, CaseDoc>; onPick: (e: Evidence) => void; active: Evidence | null }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px]">{m.label}</span>
        <span className="num shrink-0 text-[13.5px] font-medium">{m.display}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <HudLabel className="text-[9px]">{agentShort(m.agent)}</HudLabel>
        {m.formula && <span className="truncate text-[11px] text-muted-foreground" title={m.formula}>{m.formula}</span>}
      </div>
      {m.sources.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {m.sources.slice(0, 6).map((s, i) => (
            <button key={i} onClick={() => onPick(s)} title={byId[s.document_id]?.filename}
              className={cn("num max-w-[160px] truncate border px-1.5 py-0.5 text-[10.5px] hover:border-agent-border hover:text-agent-text",
                active === s ? "border-agent bg-agent-soft text-agent-text" : "border-border text-muted-foreground")}>
              {s.quote}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
