// Keyboard batch review of the facts the agents extracted: J/K move, A accept, R reject, E correct,
// Shift+A accepts every verified fact without a conflict. Conflicting facts need an individual decision.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import type { AgentRun, ReviewFact } from "@/lib/agent-types";
import { api } from "@/lib/api";
import { agentShort, kindLabel } from "@/lib/labels";
import { latestRunKey } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Empty, HudLabel, Kbd, Tag } from "./hud";

type Decision = { action: "accept" | "reject" | "correct"; value?: string };

export function ReviewBatch({ run, caseId, canReview, docNames, onFocus }: { run: AgentRun; caseId: string; canReview: boolean; docNames: Record<string, string>; onFocus?: (fact: ReviewFact) => void }) {
  const qc = useQueryClient();
  const facts = run.board.facts;
  const [cursor, setCursor] = useState(0);
  const [local, setLocal] = useState<Record<string, Decision>>({});
  const [reason,setReason] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
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
      if (editing || (e.target as HTMLElement)?.closest("input,textarea")) return;
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
  useEffect(() => { list.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); const f = sorted[cursor]; if (f) onFocus?.(f); }, [cursor, sorted]);

  if (!facts.length) return <Empty>Agenții nu au publicat încă fapte de revizuit.</Empty>;
  const pct = Math.round((done / facts.length) * 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border bg-card px-4 py-3">
        <div className="min-w-[240px] flex-1 space-y-2">
          <div className="flex items-baseline justify-between">
            <HudLabel>Revizie {done}/{facts.length}</HudLabel>
            <span className="num text-xs text-muted-foreground">{pct === 100 ? "Complet" : `${pct}%`}</span>
          </div>
          <div className="h-1.5 border bg-surface-2"><div className="h-full bg-human transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <Kbd>J</Kbd><Kbd>K</Kbd> navighează <Kbd>A</Kbd> acceptă <Kbd>R</Kbd> respinge <Kbd>E</Kbd> corectează
        </div>
        {editable && (
          <div className="flex gap-2">
            <button onClick={() => sendAll(true)} disabled={submit.isPending}
              className="inline-flex items-center gap-2 border-2 border-human bg-human px-3 py-1.5 text-[15px] font-medium text-human-foreground disabled:opacity-50">
              <CheckCheck className="h-4 w-4" />Acceptă toate verificate ({bulk.length}) <Kbd>⇧A</Kbd>
            </button>
            {Object.keys(local).length > 0 && (
              <button onClick={() => sendAll(false)} disabled={submit.isPending} className="border border-border-strong px-3 py-1.5 text-[15px] hover:bg-surface-2">
                Trimite {Object.keys(local).length} decizii
              </button>
            )}
          </div>
        )}
      </div>
      {editable && <label className="block text-sm">Motiv pentru corecții, respingeri sau acceptarea conflictelor<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} className="mt-1 block w-full border bg-surface-1 p-2" placeholder="Descrie verificarea făcută și sursa folosită (minimum 10 caractere)."/></label>}
      {!canReview && <p className="text-[14px] text-muted-foreground">Revizia faptelor o face ofițerul dosarului. Decidentul verifică separat recomandarea.</p>}
      <div ref={list} className="divide-y border bg-card" role="listbox" aria-label="Fapte extrase">
        {sorted.map((f, i) => {
          const s = state(f);
          return (
            <div key={f.id} data-index={i} role="option" aria-selected={i === cursor} onClick={() => setCursor(i)}
              className={cn("grid cursor-pointer grid-cols-[22px_minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3",
                i === cursor && "bg-surface-2 outline outline-1 -outline-offset-1 outline-human", f.conflict && "border-l-2 border-l-danger")}>
              <span className="flex h-4 w-4 items-center justify-center border">
                {s === "accept" && <Check className="h-3 w-3 text-success" />}{s === "reject" && <X className="h-3 w-3 text-danger" />}{s === "correct" && <Pencil className="h-3 w-3 text-warning" />}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[15px]">{f.label}</div>
                <div className="hud-label mt-1 text-[12px] text-muted-foreground">{agentShort(f.agent)}{f.conflict && <span className="ml-2 text-danger">conflict</span>}</div>
              </div>
              <div>
                {editing === f.id ? (
                  <input autoFocus defaultValue={f.value} className="num w-full border border-human bg-surface-1 px-2 py-1 text-[15px] outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { setLocal((l) => ({ ...l, [f.id]: { action: "correct", value: (e.target as HTMLInputElement).value } })); setEditing(null); }
                      if (e.key === "Escape") setEditing(null);
                    }} />
                ) : (
                  <span className={cn("num text-[15px]", s === "reject" && "line-through text-muted-foreground")}>{local[f.id]?.value ?? f.value}</span>
                )}
              </div>
              <Tag tone={f.verified ? "success" : "danger"}>{f.verified ? "găsit în document" : "negăsit"}</Tag>
            </div>
          );
        })}
      </div>
    </div>
  );
}
