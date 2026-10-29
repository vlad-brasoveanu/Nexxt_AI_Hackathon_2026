// Keyboard batch review of the facts the agents extracted: J/K move, A accept, R reject, E correct,
// Shift+A accepts every verified fact without a conflict. Conflicting facts need an individual decision.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import type { AgentRun, ReviewFact } from "@/lib/agent-types";
import { api } from "@/lib/api";
import { agentShort } from "@/lib/labels";
import { latestRunKey } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Empty, HudLabel, Kbd, Tag } from "./hud";

type Decision = { action: "accept" | "reject" | "correct"; value?: string };

export function ReviewBatch({ run, caseId, canReview, docNames, onFocus, focusedFactId }: { run: AgentRun; caseId: string; canReview: boolean; docNames: Record<string, string>; focusedFactId?: string; onFocus?: (fact: ReviewFact) => void }) {
  const qc = useQueryClient();
  const facts = run.board.facts;
  const [cursor, setCursor] = useState(() => Math.max(0,[...facts].sort((a,b)=>Number(b.conflict)-Number(a.conflict)).findIndex(f=>f.id===focusedFactId)));
  const [local, setLocal] = useState<Record<string, Decision>>({});
  const [reason,setReason] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const editInput = useRef<HTMLInputElement>(null);
  const editable = canReview && run.is_current && (run.status === "AWAITING_DECISION" || run.status === "WAITING_CLIENT");

  const state = (f: ReviewFact) => local[f.id]?.action ?? (f.review === "pending" ? null : f.review === "accepted" ? "accept" : f.review === "rejected" ? "reject" : "correct");
  const done = facts.filter((f) => state(f) !== null).length;
  const bulk = facts.filter((f) => f.verified && !f.conflict && state(f) === null);

  const submit = useMutation({
    mutationFn: (body: { accept_all_verified: boolean; decisions: { fact_id: string; action: Decision["action"]; value?: string }[] }) => api.reviewFacts(run.id, body),
    onSuccess: (r) => {
      setLocal({});
      qc.setQueryData(latestRunKey(caseId), r);
      toast.success("Revizia a fost trimisă" + (r.status === "RUNNING" ? ": agenții recalculează indicatorii afectați" : ""));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendAll = (acceptAll: boolean) => submit.mutate({
    accept_all_verified: acceptAll,
    decisions: Object.entries(local).map(([fact_id, d]) => ({ fact_id, action: d.action, ...(d.value ? { value: d.value } : {}), ...(reason.trim() ? {reason:reason.trim()} : {}) })),
  });

  const sorted = useMemo(() => [...facts].sort((a, b) => Number(b.conflict) - Number(a.conflict)), [facts]);

  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement)?.closest("input,textarea,button,a,summary")) return;
      const f = sorted[cursor];
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(sorted.length - 1, c + 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else if (e.key === "A" && e.shiftKey) { e.preventDefault(); sendAll(true); }
      else if (f && e.key === "a") { setLocal((l) => ({ ...l, [f.id]: { action: "accept" } })); setCursor((c) => Math.min(sorted.length - 1, c + 1)); }
      else if (f && e.key === "r") { setLocal((l) => ({ ...l, [f.id]: { action: "reject" } })); setCursor((c) => Math.min(sorted.length - 1, c + 1)); }
      else if (f && e.key === "e" && f.normalized != null) { e.preventDefault(); setEditing(f.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {setLocal({});setReason("");setEditing(null);},[run.id]);
  useEffect(() => {
    const container=list.current, row=container?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    if(container&&row){const box=row.getBoundingClientRect(),parent=container.getBoundingClientRect();if(box.top<parent.top)container.scrollTop-=parent.top-box.top;else if(box.bottom>parent.bottom)container.scrollTop+=box.bottom-parent.bottom;}
    const fact=sorted[cursor];if(fact)onFocus?.(fact);
  },[cursor,sorted]);

  if (!facts.length) return <Empty>Agenții nu au publicat încă fapte de revizuit.</Empty>;
  const selectedFact = sorted[cursor];
  const pct = Math.round((done / facts.length) * 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
        <div className="min-w-[240px] flex-1 space-y-2">
          <div className="flex items-baseline justify-between">
            <HudLabel>Revizie {done}/{facts.length}</HudLabel>
            <span className="num text-xs text-muted-foreground">{pct === 100 ? "Complet" : `${pct}%`}</span>
          </div>
          <div className="h-1.5 border bg-surface-2"><div className={cn("h-full transition-[width] duration-200",pct === 100 ? "bg-success" : "bg-human")} style={{ width: `${pct}%` }} /></div>
        </div>
        <details className="text-sm text-muted-foreground"><summary>Scurtături</summary><p><Kbd>J</Kbd> / <Kbd>K</Kbd> navighează · <Kbd>A</Kbd> acceptă · <Kbd>R</Kbd> respinge · <Kbd>E</Kbd> corectează</p></details>
        {editable && (bulk.length > 0 || Object.keys(local).length > 0) && (
          <div className="flex gap-2">
            <button onClick={() => sendAll(true)} disabled={submit.isPending || (bulk.length === 0 && Object.keys(local).length === 0)}
              className="inline-flex items-center gap-2 border-2 border-human bg-human px-3 py-1.5 text-[15px] font-medium text-human-foreground disabled:opacity-50">
              <CheckCheck className="h-4 w-4" />Confirmă datele verificate ({bulk.length})
            </button>
            {Object.keys(local).length > 0 && (
              <button onClick={() => sendAll(false)} disabled={submit.isPending} className="border border-border-strong px-3 py-1.5 text-[15px] hover:bg-surface-2">
                Salvează {Object.keys(local).length} {Object.keys(local).length === 1 ? "verificare" : "verificări"}
              </button>
            )}
          </div>
        )}
      </div>
      {editable && selectedFact && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"><span className="mr-auto text-sm">{selectedFact.label}</span><button className="inline-flex items-center gap-2 border px-3 py-2 text-sm text-success" onClick={()=>setLocal(l=>({...l,[selectedFact.id]:{action:"accept"}}))}><Check className="h-4 w-4"/>Confirmă</button><button className="inline-flex items-center gap-2 border px-3 py-2 text-sm text-danger" onClick={()=>setLocal(l=>({...l,[selectedFact.id]:{action:"reject"}}))}><X className="h-4 w-4"/>Respinge valoarea</button>{selectedFact.normalized != null && <button className="inline-flex items-center gap-2 border px-3 py-2 text-sm" onClick={()=>setEditing(selectedFact.id)}><Pencil className="h-4 w-4"/>Corectează</button>}</div>}
      {editable && <details className="rounded-lg border bg-card px-4" open={Object.entries(local).some(([id,d])=>d.action!=="accept" || facts.find(f=>f.id===id)?.conflict) || undefined}><summary className="text-sm">Motivul modificărilor</summary><label className="block text-sm">Motiv pentru corecții, respingeri sau acceptarea conflictelor<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} className="mt-1 block w-full border bg-surface-1 p-2" placeholder="Descrie verificarea făcută și sursa folosită (minimum 10 caractere)."/></label></details>}
      {!canReview && <p className="text-[14px] text-muted-foreground">Revizia faptelor o face ofițerul dosarului. Decidentul verifică separat recomandarea.</p>}
      <div ref={list} className="review-facts divide-y rounded-xl border bg-card" role="grid" aria-label="Fapte extrase">
        {sorted.map((f, i) => {
          const s = state(f);
          return (
            <div key={f.id} data-index={i} role="row" aria-selected={i === cursor} tabIndex={i === cursor ? 0 : -1} onFocus={()=>setCursor(i)} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();onFocus?.(f);}}} onClick={() => setCursor(i)}
              className={cn("grid cursor-pointer grid-cols-[22px_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-3 px-4 py-3",
                i === cursor && "bg-surface-2 outline outline-1 -outline-offset-1 outline-human", f.conflict && "border-l-2 border-l-danger")}>
              <span role="gridcell" className="flex h-4 w-4 items-center justify-center border">
                {s === "accept" && <Check className="h-3 w-3 text-success" />}{s === "reject" && <X className="h-3 w-3 text-danger" />}{s === "correct" && <Pencil className="h-3 w-3 text-warning" />}
              </span>
              <div role="gridcell" className="min-w-0">
                <div className="text-[15px] leading-snug">{f.label}</div>
                <div className="hud-label mt-1 truncate text-sm text-muted-foreground" title={docNames[f.evidence.document_id]}>{docNames[f.evidence.document_id] ?? agentShort(f.agent)} · p. {f.evidence.page}{f.conflict && <span className="ml-2 text-danger">conflict</span>}</div>
              </div>
              <div role="gridcell">
                {editing === f.id ? (
                  <div className="space-y-2"><input ref={editInput} aria-label={`Valoare corectată: ${f.label}`} autoFocus defaultValue={f.value} className="num w-full border border-human bg-surface-1 px-2 py-1 text-[15px] outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { setLocal((l) => ({ ...l, [f.id]: { action: "correct", value: (e.target as HTMLInputElement).value } })); setEditing(null); }
                      if (e.key === "Escape") setEditing(null);
                    }} /><button className="border px-2 py-1 text-sm text-agent-text" onClick={e=>{e.stopPropagation();setLocal(l=>({...l,[f.id]:{action:"correct",value:editInput.current?.value??f.value}}));setEditing(null);}}>Salvează valoarea</button></div>
                ) : (
                  <span className={cn("num text-[15px]", s === "reject" && "line-through text-muted-foreground")}>{local[f.id]?.value ?? f.value}</span>
                )}
              </div>
              {!f.verified && <Tag tone="danger">Sursă negăsită</Tag>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
