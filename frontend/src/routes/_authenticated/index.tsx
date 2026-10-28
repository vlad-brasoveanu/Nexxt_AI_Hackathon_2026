import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { creditCasesQ, sessionQ } from "@/lib/queries";
import { REC_LABEL, REC_TONE, RUN_STATUS_META, WAITING_FOR_LABEL } from "@/lib/labels";
import { fmtAge, fmtRon } from "@/lib/format";
import type { CreditCaseSummary } from "@/lib/agent-types";
import { Empty, HudLabel, Stat, Tag } from "@/components/casecheck/hud";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  component: Queue,
});

const FILTERS = [
  { key: "all", label: "Toate" },
  { key: "mine", label: "La mine" },
  { key: "client", label: "Așteaptă clientul" },
  { key: "decision", label: "Așteaptă decizia" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function mine(c: CreditCaseSummary, role: string) {
  if (!c.waiting_for) return false;
  if (role === "analyst" || role === "manager") return c.waiting_for === "analyst";
  return c.waiting_for === role;
}

function Queue() {
  const cases = useQuery({ ...creditCasesQ(), refetchInterval: 4000 });
  const role = useQuery(sessionQ()).data?.user.role ?? "";
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const list = cases.data ?? [];

  const counts = useMemo(() => ({
    running: list.filter((c) => c.run?.status === "RUNNING").length,
    client: list.filter((c) => c.run?.status === "WAITING_CLIENT").length,
    decision: list.filter((c) => c.run?.status === "AWAITING_DECISION").length,
    decided: list.filter((c) => c.run?.status === "DECIDED").length,
  }), [list]);

  const shown = list.filter((c) => {
    const match = `${c.company} ${c.cui}`.toLowerCase().includes(q.toLowerCase());
    if (!match) return false;
    if (filter === "mine") return mine(c, role);
    if (filter === "client") return c.run?.status === "WAITING_CLIENT";
    if (filter === "decision") return c.run?.status === "AWAITING_DECISION";
    return true;
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header className="space-y-3">
        <HudLabel className="text-agent-text">Credit IMM · agenții pregătesc, oamenii decid</HudLabel>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[34px] font-medium leading-none tracking-tight">Coada de lucru</h1>
          <label className="relative w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după firmă sau CUI…"
              className="h-9 w-full border border-border bg-surface-1 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-agent-border" />
          </label>
        </div>
        <div className="hud-rule" />
      </header>

      <div className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
        {[
          { label: "Agenții lucrează", value: counts.running, tone: "agent" as const },
          { label: "Așteaptă clientul", value: counts.client, tone: "warning" as const },
          { label: "Așteaptă decizia umană", value: counts.decision, tone: undefined },
          { label: "Decise", value: counts.decided, tone: "success" as const },
        ].map((k) => (
          <div key={k.label} className="bg-card px-5 py-4"><Stat label={k.label} value={k.value} tone={k.tone} /></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={cn("hud-label border px-3 py-2 transition-colors",
              filter === f.key ? "border-human bg-human text-human-foreground" : "border-border bg-surface-1 text-muted-foreground hover:border-border-strong hover:text-foreground")}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="border bg-card">
        <div className="hud-label grid grid-cols-[minmax(240px,2.2fr)_1fr_1.1fr_1.4fr_1.6fr_70px] gap-4 border-b px-5 py-3 text-muted-foreground">
          <span>Dosar</span><span>Solicitare</span><span>Stare</span><span>Recomandare agenți</span><span>Rutare</span><span className="text-right">Vechime</span>
        </div>
        {shown.map((c) => {
          const status = c.run ? RUN_STATUS_META[c.run.status] : null;
          return (
            <Link key={c.id} to="/credit/$id" params={{ id: c.id }}
              className="group grid grid-cols-[minmax(240px,2.2fr)_1fr_1.1fr_1.4fr_1.6fr_70px] items-center gap-4 border-b px-5 py-4 last:border-0 hover:bg-surface-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate text-[15px] font-medium">
                  {c.company}<ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </div>
                <div className="num mt-1 text-[11.5px] text-muted-foreground">CUI {c.cui} · {c.channel}</div>
              </div>
              <div>
                <div className="num text-[14px]">{fmtRon(c.amount)}</div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">{c.term_months} luni</div>
              </div>
              <div>{status ? <Tag tone={status.tone} className={c.run?.status === "RUNNING" ? "animate-pulse" : undefined}>{status.label}</Tag> : <Tag>Neînceput</Tag>}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {c.run?.recommendation ? <Tag tone={REC_TONE[c.run.recommendation]}>{REC_LABEL[c.run.recommendation]}</Tag> : <span className="text-xs text-muted-foreground">—</span>}
                {c.run?.level && <Tag tone="neutral">{c.run.level}</Tag>}
              </div>
              <div className="min-w-0">
                {c.waiting_for ? (
                  <>
                    <div className={cn("text-[13px]", mine(c, role) && "text-agent-text")}>→ {WAITING_FOR_LABEL[c.waiting_for] ?? c.waiting_for}{mine(c, role) && " (tu)"}</div>
                    {c.routing_reason && <div className="mt-1 truncate text-[11.5px] text-muted-foreground" title={c.routing_reason}>{c.routing_reason}</div>}
                  </>
                ) : (
                  <div className="truncate text-[11.5px] text-muted-foreground" title={c.run?.last_step ?? undefined}>{c.run?.last_step ?? "Agenții nu au fost porniți"}</div>
                )}
              </div>
              <div className="num text-right text-[12px] text-muted-foreground">{fmtAge(c.created_at)}</div>
            </Link>
          );
        })}
        {cases.isLoading && <Empty className="m-4">Se încarcă dosarele…</Empty>}
        {cases.isError && <Empty className="m-4">Dosarele nu au putut fi încărcate.</Empty>}
        {cases.isSuccess && shown.length === 0 && (
          <Empty className="m-4">{list.length ? "Niciun dosar nu corespunde filtrului." : "Niciun dosar de credit. Încarcă dosarele demo cu scripts/demo/credit_seed.py."}</Empty>
        )}
      </div>
    </div>
  );
}
