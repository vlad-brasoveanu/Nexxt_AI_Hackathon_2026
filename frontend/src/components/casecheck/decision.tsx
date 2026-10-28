// Decision cockpit: the agents' recommendation with its evidence, a live what-if on amount and term, and the
// human decision (Aprobă / Modifică / Respinge) signed on the required authority level with four eyes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Lock, Scale, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { AgentRun, HumanAction, WhatIf } from "@/lib/agent-types";
import { api } from "@/lib/api";
import { ACTION_DONE_LABEL, ACTION_LABEL, LEVEL_RANK, LEVEL_ROLE, REC_LABEL, REC_TONE, ROLE_RANK, roleLabel, type Level } from "@/lib/labels";
import { fmtInt, fmtIsoDate, fmtNum, fmtPct, fmtRon, fmtX } from "@/lib/format";
import { latestRunKey, whatIfQ } from "@/lib/queries";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HoldToSign } from "./hold-to-sign";
import { Empty, HudLabel, Panel, Stat, Tag } from "./hud";

/** Semicircle DSCR gauge from 0,5x to 2,5x with the policy threshold and the stressed value. */
export function DscrGauge({ value, stressed, threshold = 1.2 }: { value: number; stressed?: number | null; threshold?: number }) {
  const min = 0.5, max = 2.5;
  const angle = (v: number) => Math.PI * (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min));
  const point = (v: number, r: number) => [100 + r * Math.cos(angle(v)), 100 - r * Math.sin(angle(v))] as const;
  const arc = (from: number, to: number, r: number) => {
    const [x1, y1] = point(from, r), [x2, y2] = point(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const pass = value >= threshold;
  const [nx, ny] = point(value, 70);
  const [tx1, ty1] = point(threshold, 62), [tx2, ty2] = point(threshold, 92);
  return (
    <svg viewBox="0 0 200 118" className="w-full max-w-[260px]" role="img" aria-label={`DSCR ${fmtX(value)}, prag ${fmtX(threshold)}`}>
      <path d={arc(min, threshold, 80)} stroke="var(--danger)" strokeOpacity="0.55" strokeWidth="10" fill="none" />
      <path d={arc(threshold, max, 80)} stroke="var(--success)" strokeOpacity="0.55" strokeWidth="10" fill="none" />
      <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="var(--foreground)" strokeWidth="2" />
      {stressed != null && (() => { const [sx, sy] = point(stressed, 80); return <circle cx={sx} cy={sy} r="4" fill="var(--warning)" />; })()}
      <line x1="100" y1="100" x2={nx} y2={ny} stroke={pass ? "var(--agent)" : "var(--danger)"} strokeWidth="3" />
      <circle cx="100" cy="100" r="5" fill="var(--foreground)" />
      <text x="100" y="86" textAnchor="middle" className="num" fontSize="20" fill="currentColor">{fmtX(value)}</text>
      <text x="22" y="114" fontSize="8" fill="var(--muted-foreground)" className="num">0,5x</text>
      <text x="164" y="114" fontSize="8" fill="var(--muted-foreground)" className="num">2,5x</text>
    </svg>
  );
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function DecisionCockpit({ run, caseId, user, humanSeconds }: { run: AgentRun; caseId: string; user: User; humanSeconds: () => number }) {
  const qc = useQueryClient();
  const rec = run.recommendation;
  const proposed = rec?.proposed;
  const requested = rec?.requested;
  const [amount, setAmount] = useState<number>(proposed?.amount ?? requested?.amount ?? 0);
  const [term, setTerm] = useState<number>(proposed?.term_months ?? requested?.term_months ?? 60);
  const [action, setAction] = useState<HumanAction>(rec?.decision === "DECLINE" ? "REJECT" : "APPROVE");
  const [reason, setReason] = useState("");
  useEffect(() => { setAmount(proposed?.amount ?? requested?.amount ?? 0); setTerm(proposed?.term_months ?? requested?.term_months ?? 60); },
    [proposed?.amount, proposed?.term_months, requested?.amount, requested?.term_months]);

  const debouncedAmount = useDebounced(amount), debouncedTerm = useDebounced(term);
  const canPrice = !!rec && rec.decision !== "NEEDS_INFORMATION" && (run.board.metrics.some((m) => m.id === "cfads"));
  const whatIf = useQuery({ ...whatIfQ(run.id, debouncedAmount, debouncedTerm), enabled: canPrice && debouncedAmount > 0 });

  const decide = useMutation({
    mutationFn: () => api.decide(caseId, {
      run_id: run.id, action, reason: reason.trim() || undefined, human_seconds: Math.round(humanSeconds()),
      ...(action === "MODIFY" ? { terms: { amount, term_months: term } } : {}),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: latestRunKey(caseId) });
      qc.invalidateQueries({ queryKey: ["credit-cases"] });
      toast.success(d.status === "FINAL" ? `Decizie semnată: ${ACTION_DONE_LABEL[d.action]}` : "Vot înregistrat: comitetul are nevoie de al doilea vot");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!rec) return <Empty>Recomandarea apare după ce Agentul Politică evaluează dosarul.</Empty>;

  const decision = run.decision;
  const reviewed = run.steps.some((s) => s.agent === "human" && s.title.startsWith("Revizie"));
  const override = action === "MODIFY" || (action === "REJECT" && rec.decision !== "DECLINE") || (action === "APPROVE" && rec.decision === "DECLINE");
  const requiredLevel: Level = action === "REJECT" ? "L1" : action === "MODIFY" ? ((whatIf.data?.level as Level | undefined) ?? "L3")
    : rec.decision === "DECLINE" ? "L3" : rec.level;
  const rank = ROLE_RANK[user.role];
  const preparer = run.prepared_by === user.username;
  const blockers: string[] = [];
  if (run.status !== "AWAITING_DECISION") blockers.push(run.status === "DECIDED" ? "Dosarul a fost decis." : "Agenții lucrează încă la dosar.");
  if (rec.decision === "NEEDS_INFORMATION") blockers.push("Dosarul este incomplet: se așteaptă clientul.");
  if (!reviewed) blockers.push("Faptele extrase nu au fost revizuite de analist (tab-ul Revizie).");
  if (!rank) blockers.push(`Rolul ${roleLabel(user.role)} nu poate semna decizii de credit.`);
  else if (rank < LEVEL_RANK[requiredLevel]) blockers.push(`Decizia necesită nivelul ${requiredLevel} (${LEVEL_ROLE[requiredLevel].label}).`);
  if (preparer) blockers.push("Regula celor patru ochi: ai pregătit dosarul, nu îl poți decide.");
  if (override && reason.trim().length < 10) blockers.push("Motivul este obligatoriu (min. 10 caractere) când decizia diferă de recomandare.");

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <div className="space-y-5">
        <Panel agent eyebrow={`Recomandarea agenților · ${rec.policy_version}`} title={<span className="flex items-center gap-2"><Tag tone={REC_TONE[rec.decision]}>{REC_LABEL[rec.decision]}</Tag>{rec.superseded && <Tag tone="warning">înlocuită</Tag>}</span>}
          actions={<Tag tone="human"><Scale className="h-3 w-3" />{rec.level} · {LEVEL_ROLE[rec.level].label}</Tag>}>
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            {proposed ? <DscrGauge value={proposed.dscr} stressed={proposed.dscr_stressed} /> : (
              <div className="flex h-[118px] w-[220px] items-center justify-center border border-dashed text-sm text-muted-foreground">Fără termeni propuși</div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Stat label="Solicitat" value={fmtInt(rec.requested.amount)} sub={`RON · ${rec.requested.term_months} luni`} />
              <Stat label={rec.decision === "COUNTER_OFFER" ? "Propus de agenți" : "Termeni"} value={proposed ? fmtInt(proposed.amount) : "—"} tone="agent"
                sub={proposed ? `RON · ${proposed.term_months} luni` : undefined} />
              <Stat label="Dobândă" value={proposed ? fmtPct(proposed.rate_pct, 2) : "—"}
                sub={proposed ? `${proposed.index} ${fmtPct(proposed.index_value_pct, 2)} + ${fmtPct(proposed.margin_pct, 2)}` : `${rec.market.index} ${fmtPct(rec.market.value_pct, 2)}`} />
              <Stat label="Rată lunară" value={proposed ? fmtInt(proposed.monthly_payment) : "—"}
                sub={proposed ? `stres ${fmtX(proposed.dscr_stressed)}${proposed.ltv_pct != null ? ` · LTV ${fmtPct(proposed.ltv_pct)}` : ""}` : undefined} />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {rec.reasons.map((r) => (
              <div key={r.code} className="flex gap-2.5 text-[13px]">
                <span className="num shrink-0 border border-border-strong px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{r.code}</span><span>{r.text}</span>
              </div>
            ))}
          </div>
          {rec.conditions.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <HudLabel>Condiții propuse</HudLabel>
              <ul className="mt-2 space-y-1.5">{rec.conditions.map((c) => <li key={c} className="flex gap-2 text-[12.5px]"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-agent-text" />{c}</li>)}</ul>
            </div>
          )}
          <p className="mt-4 border-t pt-3 text-[11.5px] text-muted-foreground">
            {rec.level_reason} · Piață: {rec.market.index} {fmtPct(rec.market.value_pct, 2)} la {fmtIsoDate(rec.market.as_of)}, {rec.market.source}
          </p>
        </Panel>

        {canPrice && (
          <Panel eyebrow="Simulare (determinist, fără model)" title="Ce-ar fi dacă — suma și durata">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <input type="range" min={Math.round((rec.requested.amount * 0.3) / 10000) * 10000} max={rec.requested.amount} step={10000}
                  value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="flex-1 accent-[var(--agent)]" aria-label="Suma" />
                <span className="num w-36 text-right text-lg">{fmtInt(amount)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <HudLabel>Durata</HudLabel>
                {[36, 48, 60, 72, 84].map((m) => (
                  <button key={m} onClick={() => setTerm(m)} className={cn("num border px-2.5 py-1 text-[12px]", term === m ? "border-human bg-human text-human-foreground" : "border-border hover:border-border-strong")}>{m} luni</button>
                ))}
              </div>
              <WhatIfRow data={whatIf.data} loading={whatIf.isFetching} />
            </div>
          </Panel>
        )}

        {run.board.analyst && (
          <Panel eyebrow="Analist financiar · date istorice sintetice" title="Sector și precedente">
            <p className="text-[13px] text-muted-foreground">{run.board.analyst.summary}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-2.5">
                {run.board.analyst.benchmarks.map((b) => (
                  <div key={b.metric}>
                    <div className="flex items-baseline justify-between text-[12px]"><span>{b.label}</span><span className="num">{fmtNum(b.value)} · p{b.percentile}</span></div>
                    <div className="relative mt-1 h-2 border bg-surface-2">
                      <div className="absolute inset-y-0 bg-border-strong" style={{ left: `${pos(b.p25, b)}%`, width: `${Math.max(1, pos(b.p75, b) - pos(b.p25, b))}%` }} />
                      <div className="absolute inset-y-[-3px] w-0.5 bg-agent" style={{ left: `${pos(b.value, b)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <table className="w-full text-[12px]">
                <thead><tr className="hud-label text-muted-foreground"><th className="py-1 text-left">Caz</th><th className="text-right">DSCR</th><th className="text-right">Decizie</th><th className="text-right">24 luni</th></tr></thead>
                <tbody>
                  {run.board.analyst.precedents.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="num py-1.5">{p.id} <span className="text-muted-foreground">· {p.year}</span></td>
                      <td className="num text-right">{fmtX(p.dscr)}</td>
                      <td className="text-right">{p.decision === "APPROVE" ? "aprobat" : p.decision === "MODIFY" ? "modificat" : "respins"}</td>
                      <td className={cn("text-right", p.outcome_24m === "default" && "text-danger", p.outcome_24m === "late" && "text-warning")}>{p.outcome_24m ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>

      <div className="space-y-5">
        {decision ? <DecisionResult run={run} /> : (
          <Panel eyebrow="Decizie umană" title="Analistul uman decide" className="border-human">
            <div className="grid grid-cols-3 gap-px border bg-border" role="radiogroup" aria-label="Acțiune">
              {(["APPROVE", "MODIFY", "REJECT"] as HumanAction[]).map((a) => (
                <button key={a} role="radio" aria-checked={action === a} onClick={() => setAction(a)}
                  className={cn("py-3 text-[14px] font-medium", action === a ? (a === "REJECT" ? "bg-danger text-destructive-foreground" : "bg-human text-human-foreground") : "bg-card hover:bg-surface-2")}>
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              {action === "APPROVE" && (rec.decision === "DECLINE" ? `Aprobi suma solicitată (${fmtRon(rec.requested.amount)}) împotriva recomandării: excepție, comitet.` : `Accepți termenii propuși de agenți${proposed ? `: ${fmtRon(proposed.amount)}, ${proposed.term_months} luni` : ""}.`)}
              {action === "MODIFY" && `Aprobi cu termenii din simulare: ${fmtRon(amount)}, ${term} luni${whatIf.data ? (whatIf.data.passes ? " (respectă politica)" : " (încalcă politica: excepție)") : ""}.`}
              {action === "REJECT" && (rec.decision === "DECLINE" ? "Confirmi respingerea recomandată de agenți." : "Respingi un dosar pe care agenții îl recomandă: motivul este obligatoriu.")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              <Tag tone={rank && rank >= LEVEL_RANK[requiredLevel] ? "success" : "danger"}><Lock className="h-3 w-3" />Necesită {requiredLevel}</Tag>
              <Tag tone={preparer ? "danger" : "success"}><Eye className="h-3 w-3" />Patru ochi{run.prepared_by ? ` · pregătit de ${run.prepared_by}` : ""}</Tag>
              {requiredLevel === "L3" && <Tag tone="violet"><Users className="h-3 w-3" />2 voturi</Tag>}
              {override && <Tag tone="warning">override</Tag>}
            </div>
            <label className="mt-4 block">
              <HudLabel>Motivare {override ? "(obligatorie)" : "(opțională)"}</HudLabel>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                className="mt-1.5 w-full border border-border bg-surface-1 p-2.5 text-[13px] outline-none focus:border-human"
                placeholder={override ? "De ce decizia diferă de recomandarea agenților…" : "Observații pentru dosar…"} />
            </label>
            {blockers.length > 0 && (
              <ul className="mt-3 space-y-1">
                {blockers.map((b) => <li key={b} className="flex gap-2 text-[12px] text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{b}</li>)}
              </ul>
            )}
            <div className="mt-4">
              <HoldToSign label={`${ACTION_LABEL[action]} · semnează ca ${user.username}`} tone={action === "REJECT" ? "danger" : "human"}
                disabled={blockers.length > 0 || decide.isPending} onSigned={() => decide.mutate()} />
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Agenții nu pot aproba sau respinge credite: doar această semnătură poate.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function pos(v: number, b: { p25: number; p75: number; value: number }) {
  const lo = Math.min(b.p25, b.value) * 0.8, hi = Math.max(b.p75, b.value) * 1.2 || 1;
  return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
}

function WhatIfRow({ data, loading }: { data: WhatIf | undefined; loading: boolean }) {
  if (!data) return <div className="text-sm text-muted-foreground">{loading ? "Calculez…" : "—"}</div>;
  return (
    <div className={cn("grid grid-cols-2 gap-4 border p-3 md:grid-cols-5", data.passes ? "border-success/50" : "border-danger/60", loading && "opacity-60")}>
      <Stat label="DSCR" value={fmtX(data.dscr)} tone={data.dscr >= 1.2 ? "success" : "danger"} />
      <Stat label="Stres" value={fmtX(data.dscr_stressed)} />
      <Stat label="LTV" value={data.ltv_pct != null ? fmtPct(data.ltv_pct) : "—"} tone={data.ltv_pct != null && data.ltv_pct > 70 ? "danger" : undefined} />
      <Stat label="Rată" value={fmtInt(data.monthly_payment)} sub={`${fmtPct(data.rate_pct, 2)} / an`} />
      <div className="space-y-1.5">
        <HudLabel>Politică</HudLabel>
        <div className="flex items-center gap-1.5 text-[13px]">
          {data.passes ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}{data.passes ? "trece" : "nu trece"}
        </div>
        {data.level && <div className="num text-[11px] text-muted-foreground">nivel {data.level}</div>}
      </div>
    </div>
  );
}

function DecisionResult({ run }: { run: AgentRun }) {
  const d = run.decision!;
  const final = d.status === "FINAL";
  return (
    <Panel eyebrow="Decizie umană" title={<span className="flex items-center gap-2">{final ? ACTION_DONE_LABEL[d.action] : "Vot 1 din 2 în comitet"}{d.override && <Tag tone="warning">override</Tag>}</span>}
      className={final ? "border-human" : "border-violet"} actions={<Tag tone={final ? "human" : "violet"}>{d.level}</Tag>}>
      {d.terms && d.action !== "REJECT" && (
        <div className="mb-4 grid grid-cols-3 gap-4">
          <Stat label="Sumă" value={fmtInt(d.terms.amount)} sub="RON" />
          <Stat label="Durată" value={`${d.terms.term_months}`} sub="luni" />
          <Stat label="DSCR" value={fmtX(d.terms.dscr)} />
        </div>
      )}
      <ul className="space-y-1.5 text-[12.5px]">
        {d.votes.map((v) => <li key={v.username} className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" /><span className="num">{v.username}</span><span className="text-muted-foreground">{roleLabel(v.role)} · {ACTION_LABEL[v.action]}</span></li>)}
      </ul>
      {d.reason && <p className="mt-3 border-l-2 border-border-strong pl-3 text-[12.5px]">{d.reason}</p>}
      {d.human_seconds != null && <p className="num mt-3 text-[11.5px] text-muted-foreground">Timp uman activ: {Math.round(d.human_seconds)} s</p>}
      {d.letter && (
        <details className="mt-3" open={final}>
          <summary className="hud-label py-1 text-muted-foreground">Ciornă scrisoare către client</summary>
          <pre className="mt-2 whitespace-pre-wrap border bg-surface-2 p-3 font-[family-name:var(--font-sans)] text-[12.5px] leading-relaxed">{d.letter}</pre>
        </details>
      )}
    </Panel>
  );
}
