import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { metricsQ } from "@/lib/queries";
import { fmtDuration, fmtNum, fmtPct } from "@/lib/format";
import { Empty, HudLabel, Stat } from "@/components/casecheck/hud";

export const Route = createFileRoute("/_authenticated/metrici")({ component: Metrics });

function Metrics() {
  const q = useQuery({ ...metricsQ(), refetchInterval: 5000 });
  const m = q.data;
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <header className="space-y-3">
        <HudLabel className="text-agent-text">Măsurat pe dosarele din aplicație · date sintetice</HudLabel>
        <h1 className="text-[34px] font-medium leading-none tracking-tight">Metrici</h1>
        <div className="hud-rule" />
      </header>
      {!m ? <Empty>Se încarcă…</Empty> : (
        <>
          <div className="grid gap-px border bg-border md:grid-cols-2">
            <div className="bg-card p-6">
              <Stat big label="Runde de solicitări către client" value={fmtNum(m.client_rounds_avg, 1)} tone="agent" sub="în medie pe dosar · țintă: 1 cerere consolidată" />
            </div>
            <div className="bg-card p-6">
              <Stat big label="Timp uman activ (mediană)" value={fmtDuration(m.human_seconds_median)}
                sub={m.manual_baseline_seconds != null ? `față de ${fmtDuration(m.manual_baseline_seconds)} măsurat manual` : "baseline manual: nemăsurat încă"} />
            </div>
          </div>
          <div className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-card p-5"><Stat label="Indicatori cu sursă literală" value={fmtPct(m.evidence_coverage_pct, 0)} tone="success" /></div>
            <div className="bg-card p-5"><Stat label="Acțiuni blocate de gardă" value={m.refused_actions} tone={m.refused_actions ? "danger" : undefined} /></div>
            <div className="bg-card p-5"><Stat label="Injecții ignorate" value={m.injections_ignored} tone={m.injections_ignored ? "warning" : undefined} /></div>
            <div className="bg-card p-5"><Stat label="Override-uri umane" value={m.overrides} /></div>
          </div>
          <div className="grid gap-px border bg-border sm:grid-cols-2">
            <div className="bg-card p-5"><Stat label="Dosare de credit" value={m.cases} /></div>
            <div className="bg-card p-5"><Stat label="Timp de lucru al agenților (mediană)" value={fmtDuration(m.agent_seconds_median)} /></div>
          </div>
        </>
      )}
    </div>
  );
}
