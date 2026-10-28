import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { marketQ } from "@/lib/queries";
import { fmtIsoDate, fmtPct } from "@/lib/format";
import { Empty, HudLabel, Panel, Stat, Tag } from "@/components/casecheck/hud";

export const Route = createFileRoute("/_authenticated/piata")({ component: Market });

function Market() {
  const qc = useQueryClient();
  const market = useQuery(marketQ());
  const [value, setValue] = useState("6,05");
  const publish = useMutation({
    mutationFn: () => api.publishMarketSnapshot({ value_pct: Number(value.replace(",", ".")) }),
    onSuccess: (m) => {
      qc.setQueryData(["market"], m);
      qc.invalidateQueries({ queryKey: ["credit-cases"] });
      const n = (m as unknown as { reevaluated?: number }).reevaluated ?? 0;
      toast.success(`Fixing publicat: ${n} ${n === 1 ? "dosar re-evaluat" : "dosare re-evaluate"} automat`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const m = market.data;
  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <header className="space-y-3">
        <HudLabel className="text-agent-text">Politica de creditare este date, nu prompt</HudLabel>
        <h1 className="text-[34px] font-medium leading-none tracking-tight">Piață și politică</h1>
        <div className="hud-rule" />
      </header>
      {!m ? <Empty>Se încarcă…</Empty> : (
        <>
          <div className="grid gap-px border bg-border md:grid-cols-3">
            <div className="bg-card p-5"><Stat big label={m.index} value={fmtPct(m.value_pct, 2)} tone="agent" sub={`la ${fmtIsoDate(m.as_of)}`} /></div>
            <div className="bg-card p-5"><Stat label="Standard în vigoare" value={m.policy_version} sub="praguri, marje, competențe" /></div>
            <div className="bg-card p-5"><Stat label="Sursă" value={<span className="text-[15px]">{m.source}</span>} /></div>
          </div>
          <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
            <Panel agent eyebrow="Simulare feed BNR" title="Publică un fixing nou">
              <p className="text-[13px] text-muted-foreground">Dosarele care așteaptă decizia sunt re-evaluate automat de Agentul Politică. Oamenii decid în continuare.</p>
              <div className="mt-4 flex gap-2">
                <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label="ROBOR 3M (%)"
                  className="num h-11 w-32 border border-border bg-surface-1 px-3 text-lg outline-none focus:border-agent-border" />
                <button onClick={() => publish.mutate()} disabled={publish.isPending}
                  className="inline-flex items-center gap-2 bg-agent px-4 text-[14px] font-medium text-agent-foreground disabled:opacity-50">
                  <Radio className="h-4 w-4" />Publică
                </button>
              </div>
            </Panel>
            <Panel eyebrow="Istoric" title="Valori ROBOR 3M">
              <ul className="divide-y">
                {m.history.map((h, i) => (
                  <li key={`${h.as_of}-${i}`} className="flex items-center justify-between py-2 text-[13px]">
                    <span className="num">{fmtIsoDate(h.as_of)}</span>
                    <span className="truncate px-3 text-[11.5px] text-muted-foreground">{h.source}</span>
                    {i === 0 ? <Tag tone="agent">{fmtPct(h.value_pct, 2)}</Tag> : <span className="num">{fmtPct(h.value_pct, 2)}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
