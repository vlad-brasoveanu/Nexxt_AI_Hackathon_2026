import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/routes/_authenticated";
import { api } from "@/lib/api";
import { marketQ, metricsQ } from "@/lib/queries";
import { fmtDuration, fmtIsoDate, fmtNum, fmtPct } from "@/lib/format";
import { Empty, Panel, Stat } from "@/components/casecheck/hud";

export const Route = createFileRoute("/_authenticated/statistici")({ component: Statistics });
function Statistics() {
  const user=useUser();
  const qc = useQueryClient();
  const metrics = useQuery({ ...metricsQ(), refetchInterval: 5000 });
  const market = useQuery(marketQ());
  const [value, setValue] = useState("6,05");
  const publish = useMutation({
    mutationFn: () => api.publishMarketSnapshot({ value_pct: Number(value.replace(",", ".")) }),
    onSuccess: (m) => {
      qc.setQueryData(["market"], m);
      qc.invalidateQueries({ queryKey: ["credit-cases"] });
      const n = (m as unknown as { reevaluated?: number }).reevaluated ?? 0;
      toast.success(`Dobândă publicată. ${n} ${n === 1 ? "dosar a fost recalculat" : "dosare au fost recalculate"} automat.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const m = metrics.data, mk = market.data;
  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <header className="space-y-2">
        <h1 className="text-[32px] font-medium leading-tight tracking-tight">Statistici și piață</h1>
        <p className="text-[16px] text-muted-foreground">Activitatea echipei și dobânda de referință.</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-[20px] font-medium">Rezultate pe dosarele din aplicație</h2>
        {!m ? <Empty>Se încarcă…</Empty> : (
          <div className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-card p-5"><Stat label="Cereri către client / dosar" value={fmtNum(m.client_rounds_avg, 1)} tone="agent" sub="ținta este o singură cerere" /></div>
            <div className="bg-card p-5"><Stat label="Timp de lucru / dosar" value={fmtDuration(m.human_seconds_median)} sub={m.manual_baseline_seconds != null ? `manual: ${fmtDuration(m.manual_baseline_seconds)}` : "timpul manual nu a fost măsurat încă"} /></div>
            <div className="bg-card p-5"><Stat label="Timp de procesare / dosar" value={fmtDuration(m.agent_seconds_median)} /></div>
            <div className="bg-card p-5"><Stat label="Cifre cu sursă în documente" value={fmtPct(m.evidence_coverage_pct, 0)} tone="success" /></div>
            <div className="bg-card p-5"><Stat label="Acțiuni interzise blocate" value={m.refused_actions} tone={m.refused_actions ? "danger" : undefined} sub={`instrucțiuni ascunse ignorate: ${m.injections_ignored}`} /></div>
            <div className="bg-card p-5"><Stat label="Decizii diferite de recomandare" value={m.overrides} sub={`din ${m.cases} dosare`} /></div>
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-[20px] font-medium">Dobânda de referință</h2>
        {!mk ? <Empty>Se încarcă…</Empty> : (
          <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
            <Panel title={`${mk.index}: ${fmtPct(mk.value_pct, 2)}`} eyebrow={`Valabilă din ${fmtIsoDate(mk.as_of)} · politică ${mk.policy_version}`}>
              <ul className="divide-y">{mk.history.slice(0, 5).map((h, i) => <li key={`${h.as_of}-${i}`} className="flex items-center justify-between py-2 text-[15px]"><span className="num">{fmtIsoDate(h.as_of)}</span><span className="num">{fmtPct(h.value_pct, 2)}</span></li>)}</ul>
              <p className="mt-3 text-[14px] text-muted-foreground">Sursa: {mk.source}</p>
            </Panel>
            <Panel agent eyebrow="Demonstrație" title="Publică o dobândă nouă">
              <p className="text-[15px] text-muted-foreground">Dosarele care așteaptă decizia sunt recalculate automat.</p>
              <div className="mt-4 flex gap-2">
                <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label="ROBOR 3M (%)" className="num h-11 w-32 border border-border bg-surface-1 px-3 text-lg outline-none focus:border-agent-border" />
                <button onClick={() => publish.mutate()} disabled={publish.isPending||user.role!=="admin"} className="inline-flex items-center gap-2 bg-agent px-4 text-[16px] font-medium text-agent-foreground disabled:opacity-50"><Radio className="h-4 w-4" />Publică</button>
              </div>
            </Panel>
          </div>
        )}
      </section>
    </div>
  );
}
