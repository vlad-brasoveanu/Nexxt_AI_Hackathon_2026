import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { casesQ, runsQ } from "@/lib/queries";
import { DISPOSITION, dispKey, fmtDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { DispositionBadge, Empty, Mono } from "@/components/casecheck/bits";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/kyc")({
  component: CaseList,
});

const FILTERS = ["ALL", "READY_FOR_REVIEW", "NEEDS_INFORMATION", "ESCALATED", "NONE"] as const;

function CaseList() {
  const cases = useQuery(casesQ());
  const list = cases.data ?? [];
  const runs = useQueries({ queries: list.map((c) => runsQ(c.id)) });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () => list.map((c, i) => {
      const r = runs[i]?.data?.[0];
      return { c, run: r, key: dispKey(r?.result.disposition), loading: runs[i]?.isLoading };
    }),
    [list, runs],
  );
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "ALL" ? rows.length : rows.filter((r) => r.key === f).length]));
  const shown = rows.filter((r) => (filter === "ALL" || r.key === filter) && r.c.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight">Dosare KYC</h1>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Caută după titlu…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {f === "ALL" ? "Toate" : DISPOSITION[f]!.label} <span className="ml-1 opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Dosar</th>
              <th className="px-4 py-2 font-medium">Creat</th>
              <th className="px-4 py-2 font-medium">Revizie</th>
              <th className="px-4 py-2 font-medium">Dispoziție</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ c, run, loading }) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-2.5">
                  <Link to="/cases/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.title}</Link>
                  <div><Mono>{c.id}</Mono></div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(c.created_at)}</td>
                <td className="px-4 py-2.5"><Mono>r{c.revision}</Mono></td>
                <td className="px-4 py-2.5">
                  {loading ? <span className="text-xs text-muted-foreground">…</span> : (
                    <div className="flex items-center gap-2">
                      <DispositionBadge d={run?.result.disposition} />
                      {run && run.is_current === false && <span className="text-xs text-warning">Neactualizat</span>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cases.isLoading && <Empty>Se încarcă dosarele…</Empty>}
        {cases.isError && <Empty>Dosarele nu au putut fi încărcate.</Empty>}
        {cases.isSuccess && shown.length === 0 && <Empty>Niciun dosar nu corespunde filtrului.</Empty>}
      </div>
    </div>
  );
}
