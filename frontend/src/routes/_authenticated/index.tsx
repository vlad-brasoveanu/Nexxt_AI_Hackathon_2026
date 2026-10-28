import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { creditCasesQ, sessionQ } from "@/lib/queries";
import { REC_LABEL, REC_TONE, RUN_STATUS_META, WAITING_FOR_LABEL } from "@/lib/labels";
import { fmtAge, fmtRon } from "@/lib/format";
import type { CreditCaseSummary } from "@/lib/agent-types";
import { NewCreditCase } from "@/components/casecheck/new-credit-case";
import { Empty, Tag } from "@/components/casecheck/hud";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({ component: Queue });
const FILTERS = [
  { key: "all", label: "Toate" },
  { key: "client", label: "Așteaptă clientul" },
  { key: "decision", label: "Așteaptă decizia" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function mine(c: CreditCaseSummary, role: string) {
  const preparer = ["analyst","manager","case_officer","admin"].includes(role);
  if (!c.run) return preparer;
  if (["DECIDED","RUNNING"].includes(c.run.status)) return false;
  if (role==="admin") return c.waiting_for!=="client";
  if (c.run.status === "WAITING_CLIENT") return preparer && c.waiting_for==="case_officer";
  if (!c.waiting_for) return false;
  return preparer ? ["analyst","case_officer"].includes(c.waiting_for ?? "") : c.waiting_for === role;
}
function taskLabel(c: CreditCaseSummary) {
  if (!c.run) return "Pornește agenții";
  if (c.run.status === "WAITING_CLIENT") return c.waiting_for==="case_officer" ? "Verifică solicitarea către client" : "Așteaptă răspunsul clientului";
  if (["analyst","case_officer"].includes(c.waiting_for ?? "")) return "Verifică faptele extrase";
  return `Decide dosarul · ${c.run.level ?? ""}`;
}
function Queue() {
  const cases = useQuery({ ...creditCasesQ(), refetchInterval: 4000 });
  const role = useQuery(sessionQ()).data?.user.role ?? "";
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const list = cases.data ?? [];
  const todo = list.filter((c) => mine(c, role));
  const shown = list.filter((c) => {
    if (!`${c.company} ${c.cui}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "client") return c.run?.status === "WAITING_CLIENT";
    if (filter === "decision") return c.run?.status === "AWAITING_DECISION";
    return true;
  });
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[32px] font-medium leading-tight tracking-tight">Sarcinile mele</h1>
          <label className="relative w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după firmă sau CUI…" aria-label="Caută după firmă sau CUI"
              className="h-9 w-full border border-border bg-surface-1 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-agent-border" />
          </label>
        </div>
      </header>
      {["case_officer","admin","manager","analyst"].includes(role) && <NewCreditCase />}
      <section className="space-y-3">
        <h2 className="text-[20px] font-medium">De făcut de tine{todo.length ? ` (${todo.length})` : ""}</h2>
        {todo.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {todo.map((c) => <Link key={c.id} to="/credit/$id" params={{ id: c.id }} className="group block border-2 border-human bg-card px-4 py-3 hover:bg-surface-2">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{taskLabel(c)}</div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[17px] font-medium">{c.company}<ArrowUpRight className="h-4 w-4 shrink-0" /></div>
            <div className="num mt-0.5 text-[14px] text-muted-foreground">{fmtRon(c.amount)} · {c.term_months} luni</div>
          </Link>)}
        </div> : <Empty>Nu ai nimic de făcut acum. Dosarele de mai jos sunt la agenți, la client sau la alt coleg.</Empty>}
      </section>
      <h2 className="text-[20px] font-medium">Toate dosarele de credit</h2>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} className={cn("hud-label border px-3 py-2 transition-colors", filter === f.key ? "border-human bg-human text-human-foreground" : "border-border bg-surface-1 text-muted-foreground hover:border-border-strong hover:text-foreground")}>{f.label}</button>)}
      </div>
      <div className="border bg-card">
        <div className="hud-label grid grid-cols-[minmax(240px,2.2fr)_1fr_1.1fr_1.4fr_1.6fr_70px] gap-4 border-b px-5 py-3 text-muted-foreground">
          <span>Dosar</span><span>Solicitare</span><span>Stare</span><span>Recomandare agenți</span><span>Rutare</span><span className="text-right">Vechime</span>
        </div>
        {shown.map((c) => {
          const status = c.run ? RUN_STATUS_META[c.run.status] : null;
          return <Link key={c.id} to="/credit/$id" params={{ id: c.id }} className="group grid grid-cols-[minmax(240px,2.2fr)_1fr_1.1fr_1.4fr_1.6fr_70px] items-center gap-4 border-b px-5 py-4 last:border-0 hover:bg-surface-2">
            <div className="min-w-0"><div className="flex items-center gap-2 truncate text-[16px] font-medium">{c.company}<ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" /></div><div className="num mt-1 text-[13px] text-muted-foreground">CUI {c.cui} · {c.channel}</div></div>
            <div><div className="num text-[16px]">{fmtRon(c.amount)}</div><div className="mt-1 text-[13px] text-muted-foreground">{c.term_months} luni</div></div>
            <div>{status ? <Tag tone={status.tone} className={c.run?.status === "RUNNING" ? "animate-pulse" : undefined}>{status.label}</Tag> : <Tag>Neînceput</Tag>}</div>
            <div className="flex flex-wrap items-center gap-1.5">{c.run?.recommendation ? <Tag tone={REC_TONE[c.run.recommendation]}>{REC_LABEL[c.run.recommendation]}</Tag> : <span className="text-xs text-muted-foreground">—</span>}{c.run?.level && <Tag tone="neutral">{c.run.level}</Tag>}</div>
            <div className="min-w-0">{c.waiting_for ? <><div className={cn("text-[15px]", mine(c, role) && "text-agent-text")}>→ {WAITING_FOR_LABEL[c.waiting_for] ?? c.waiting_for}{mine(c, role) && " (tu)"}</div>{c.routing_reason && <div className="mt-1 truncate text-[13px] text-muted-foreground" title={c.routing_reason}>{c.routing_reason}</div>}</> : <div className="truncate text-[13px] text-muted-foreground" title={c.run?.last_step ?? undefined}>{c.run?.last_step ?? "Agenții nu au fost porniți"}</div>}</div>
            <div className="num text-right text-[14px] text-muted-foreground">{fmtAge(c.created_at)}</div>
          </Link>;
        })}
        {cases.isLoading && <Empty className="m-4">Se încarcă dosarele…</Empty>}
        {cases.isError && <Empty className="m-4">Dosarele nu au putut fi încărcate.</Empty>}
        {cases.isSuccess && shown.length === 0 && <Empty className="m-4">{list.length ? "Niciun dosar nu corespunde filtrului." : "Niciun dosar de credit."}</Empty>}
      </div>
    </div>
  );
}
