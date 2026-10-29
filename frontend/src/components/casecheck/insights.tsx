// Memo, group & KYB graph and cash-flow views of the shared board.
import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import { Building2, CheckCircle2, User as UserIcon } from "lucide-react";
import type { AgentRun, GraphNode } from "@/lib/agent-types";
import { fmtInt, fmtPct, fmtRon } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Empty, HudLabel, ModelChip, Panel, Stat, Tag } from "./hud";

export function MemoView({ run }: { run: AgentRun }) {
  const memoBoard = run.board.memo;
  const text = memoBoard?.text ?? "";
  const refs = useMemo(() => [...new Set([...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!))], [text]);
  if (!memoBoard) return <Empty>Agentul Memo redactează nota după evaluarea politicii.</Empty>;
  const parts = memoBoard.text.split(/(\[[^\]]+\])/g);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
      <Panel eyebrow="Notă de credit · cu referințe la sursă" title="Nota pentru decident"
        actions={<><Tag tone={memoBoard.unverified.length ? "danger" : "success"}><CheckCircle2 className="h-3 w-3" />{memoBoard.verified_numbers} cifre verificate · {memoBoard.unverified.length} neverificate</Tag></>}>
        <article className="max-w-[78ch] whitespace-pre-wrap text-[16px] leading-[1.75]">
          {parts.map((p, i) => {
            const m = p.match(/^\[([^\]]+)\]$/);
            if (!m) return <span key={i}>{p}</span>;
            return <sup key={i} className="num mx-0.5 border border-agent-border px-1 text-[12px] text-agent-text" title={m[1]}>{refs.indexOf(m[1]!) + 1}</sup>;
          })}
        </article>
        <details className="technical-details"><summary>Procesarea notei</summary>{memoBoard.model ? <ModelChip model={memoBoard.model} /> : <p>Șablon determinist, fără model sau după respingerea unei variante fără surse.</p>}</details>
      </Panel>
      <Panel eyebrow="Referințe" title={`${refs.length} surse citate`}>
        <ol className="space-y-1.5">
          {refs.map((r, i) => {
            const metric = run.board.metrics.find((m) => m.id === r);
            return (
              <li key={r} className="flex gap-2 text-[14px]">
                <span className="num w-5 shrink-0 text-agent-text">{i + 1}</span>
                <span className="min-w-0"><span className="num">{r}</span>{metric && <span className="block truncate text-muted-foreground">{metric.label}: {metric.display}</span>}</span>
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}

type GNode = Node<{ node: GraphNode }, "g">;
const GroupBox = memo(function GroupBox({ data }: NodeProps<GNode>) {
  const n = data.node;
  const applicant = n.type === "applicant", affiliate = n.flags.includes("afiliat");
  return (
    <div className={cn("w-[200px] border bg-card px-3 py-2.5", applicant && "border-human", affiliate && "border-warning", n.type === "person" && "border-border-strong")}>
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-border-strong" />
      <div className="flex items-center gap-2">
        {n.type === "person" ? <UserIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <Building2 className={cn("h-3.5 w-3.5", affiliate ? "text-warning" : "text-muted-foreground")} />}
        <span className="truncate text-[14px] font-medium">{n.label}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {n.flags.map((f) => <span key={f} className={cn("hud-label border px-1 py-0.5 text-[12px]", f === "afiliat" ? "border-warning/60 text-warning" : "border-border text-muted-foreground")}>{f}</span>)}
        {n.exposure != null && <span className="num text-[12px] text-muted-foreground">expunere {fmtInt(n.exposure)}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-border-strong" />
    </div>
  );
});
const groupTypes = { g: GroupBox };

export function GroupView({ run }: { run: AgentRun }) {
  const kyb = run.board.kyb;
  const graph = useMemo(() => {
    if (!kyb) return { nodes: [] as GNode[], edges: [] as Edge[] };
    const persons = kyb.nodes.filter((n) => n.type === "person");
    const companies = kyb.nodes.filter((n) => n.type !== "person" && n.type !== "applicant");
    const applicant = kyb.nodes.find((n) => n.type === "applicant");
    const row = (list: GraphNode[], y: number) => list.map((n, i) => ({ id: n.id, type: "g" as const, data: { node: n },
      position: { x: (i - (list.length - 1) / 2) * 240, y } }));
    const nodes: GNode[] = [...row(persons, 0), ...(applicant ? row([applicant], 170) : []), ...row(companies, 170).map((n, i) => ({
      ...n, position: { x: (i + 1) * 240 + 40, y: 170 } }))];
    const edges: Edge[] = kyb.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target, label: e.label,
      labelStyle: { fill: "var(--foreground)", fontFamily: "var(--font-mono)", fontSize: 11 }, labelBgStyle: { fill: "var(--card)" },
      style: { stroke: (e.share_pct ?? 0) >= 50 ? "var(--warning)" : "var(--border-strong)", strokeWidth: (e.share_pct ?? 0) >= 50 ? 1.6 : 1 } }));
    return { nodes, edges };
  }, [kyb]);
  if (!kyb) return <Empty>Agentul KYB nu a rulat încă.</Empty>;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Panel eyebrow="Structura companiei" title="Asociați, beneficiari reali și entități legate" bodyClassName="p-0">
        <div className="h-[420px]">
          <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={groupTypes} fitView fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} preventScrolling={false} proOptions={{ hideAttribution: true }}>
            <Background gap={24} size={1} color="var(--grid-strong)" />
          </ReactFlow>
        </div>
      </Panel>
      <div className="space-y-5">
        <Panel eyebrow="Expunere de grup" title={fmtRon(kyb.group_exposure)}>
          <p className="text-[14px] text-muted-foreground">Limitele aprobate de bancă pentru entitățile aflate sub control comun (≥ 50%).</p>
          <ul className="mt-3 space-y-1.5">
            {kyb.ubo.map((u) => <li key={u.name} className="flex justify-between text-[15px]"><span>{u.name}</span><span className="num text-muted-foreground">{u.share_pct}% · {u.via}</span></li>)}
          </ul>
        </Panel>
        <Panel title="Verificarea companiei">
          <ul className="space-y-2">
            {kyb.kyc_checks.map((c) => (
              <li key={c.rule_id} className="text-[14px]">
                <div className="flex items-center gap-2"><span>{({"VAL-01":"Valabilitatea actului", "CON-02":"Identificarea firmei", "BUS-05":"Actualitatea extrasului"} as Record<string,string>)[c.rule_id] ?? "Verificare"}</span><Tag tone={c.outcome === "PASS" ? "success" : c.outcome === "FAIL" ? "danger" : "warning"}>{c.outcome === "PASS" ? "Conform" : c.outcome === "FAIL" ? "Neconform" : "De verificat"}</Tag></div>
                <details className="mt-1 text-sm text-muted-foreground"><summary>Detalii verificare</summary><p>{c.rule_id} · {c.detail}</p></details>
              </li>
            ))}
            <li className="flex items-center gap-2 text-[14px]"><span className="num">Sancțiuni</span><Tag tone={kyb.sanctions_hits ? "danger" : "success"}>{kyb.sanctions_hits} potriviri</Tag></li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function CashflowView({ run }: { run: AgentRun }) {
  const cf = run.board.cashflow;
  if (!cf) return <Empty>Agentul Fluxuri de numerar nu a rulat încă.</Empty>;
  const max = Math.max(1, ...cf.monthly.map((m) => Math.max(m.inflow, m.outflow)));
  const gap = run.board.metrics.find((m) => m.id === "turnover_gap_pct");
  const op = run.board.metrics.find((m) => m.id === "operating_inflows");
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Panel eyebrow={`Extrase de cont · ${cf.period}`} title="Intrări și ieșiri lunare">
        <div className="flex h-[260px] items-end gap-2 border-b pb-1" role="img" aria-label="Fluxuri lunare">
          {cf.monthly.map((m) => (
            <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div className="relative w-1/3 bg-border-strong" style={{ height: `${(m.inflow / max) * 100}%` }} title={`Intrări ${fmtRon(m.inflow)}`}>
                  <div className="absolute inset-x-0 bottom-0 bg-agent" style={{ height: `${m.inflow ? (m.operating_inflow / m.inflow) * 100 : 0}%` }} />
                </div>
                <div className="w-1/3 bg-surface-3 outline outline-1 -outline-offset-1 outline-border-strong" style={{ height: `${(m.outflow / max) * 100}%` }} title={`Ieșiri ${fmtRon(m.outflow)}`} />
              </div>
              <span className="num text-[12px] text-muted-foreground">{m.month.slice(0, 2)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-agent" />încasări operaționale</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 bg-border-strong" />alte intrări (intragrup, asociați, dobânzi)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 border border-border-strong bg-surface-3" />ieșiri</span>
        </div>
      </Panel>
      <div className="space-y-5">
        <Panel eyebrow="Reconciliere cu cifra de afaceri" title={gap ? gap.display : "—"}>
          {op && <Stat label="Încasări operaționale" value={fmtInt(op.value)} sub="RON" />}
          <div className="mt-4 space-y-2">
            {cf.classes.map((c) => (
              <div key={c.key}>
                <div className="flex justify-between text-[14px]"><span>{c.label}</span><span className="num">{fmtPct(c.share_pct)}</span></div>
                <div className="mt-1 h-1.5 bg-surface-2"><div className={cn("h-full", c.key === "operating" ? "bg-agent" : c.key === "intragroup" ? "bg-warning" : "bg-border-strong")} style={{ width: `${c.share_pct}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Concentrare" title="Clienți principali">
          <ul className="space-y-1.5">
            {cf.top_clients.map((c, i) => (
              <li key={c.name} className="flex items-center justify-between gap-3 text-[14px]">
                <span className={cn("truncate", i === 0 && "font-medium")}>{c.name}</span>
                <span className={cn("num shrink-0", i === 0 && c.share_pct > 34 && "text-warning")}>{fmtPct(c.share_pct)}</span>
              </li>
            ))}
          </ul>
          <HudLabel className="mt-3 block">Prag politică: 40% pe clientul principal</HudLabel>
        </Panel>
      </div>
    </div>
  );
}
