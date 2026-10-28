// Live agent hierarchy: Orchestrator → Analist financiar → seven specialists → Analist uman.
// Node state comes from the run's agent cards; edges into the running agent animate in the agent accent.
import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Lock, RefreshCw, User as UserIcon, XCircle } from "lucide-react";
import type { AgentCard, AgentId, AgentRun } from "@/lib/agent-types";
import { AGENT_STATE_LABEL, agentShort } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { TierBadge } from "./hud";

type NodeData = { id: AgentId; card?: AgentCard; human?: boolean; humanState?: string; active: boolean };
type AgentNode = Node<NodeData, "agent">;

const SPECIALISTS: AgentId[] = ["completeness", "financials", "cashflow", "kyb", "policy", "memo", "critic"];
const W = 178;

const STATE_ICON = {
  idle: CircleDashed, running: Loader2, done: CheckCircle2, stale: RefreshCw, failed: XCircle, blocked: Lock,
} as const;

const AgentBox = memo(function AgentBox({ data }: NodeProps<AgentNode>) {
  const state = data.card?.status ?? "idle";
  const Icon = data.human ? UserIcon : STATE_ICON[state];
  const running = state === "running";
  return (
    <div className={cn("relative w-[178px] border bg-card px-3 py-2.5 text-left transition-colors",
      running && "scanline border-agent bg-agent-soft",
      state === "done" && "border-border-strong",
      state === "stale" && "border-dashed border-warning/60",
      state === "failed" && "border-danger",
      state === "blocked" && "border-danger/70",
      state === "idle" && "border-border opacity-70",
      data.human && "border-human bg-surface-2")}>
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-border-strong" />
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-[12.5px] font-medium", running && "text-agent-text")}>{data.human ? "Analist uman" : agentShort(data.id)}</span>
        {data.card && !data.human && <TierBadge tier={data.card.tier} />}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className={cn("h-3 w-3", running && "animate-spin text-agent-text", state === "done" && "text-success", state === "stale" && "text-warning",
          (state === "failed" || state === "blocked") && "text-danger", data.human && "text-foreground")} />
        <span className="hud-label text-[9.5px]">{data.human ? data.humanState : AGENT_STATE_LABEL[state]}</span>
        {data.card && data.card.runs > 0 && <span className="num ml-auto text-[10.5px]">×{data.card.runs}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-border-strong" />
    </div>
  );
});

const nodeTypes = { agent: AgentBox };

function humanState(run: AgentRun) {
  if (run.status === "DECIDED") return "a decis";
  if (run.status === "AWAITING_DECISION") return `decide · ${run.recommendation?.level ?? ""}`;
  return "așteaptă";
}

export function AgentGraph({ run }: { run: AgentRun }) {
  const cards = useMemo(() => Object.fromEntries(run.agents.map((a) => [a.id, a])) as Partial<Record<AgentId, AgentCard>>, [run.agents]);
  const lastDispatch = [...run.steps].reverse().find((s) => s.kind === "dispatch");
  const activeId = run.status === "RUNNING" ? (Object.values(cards).find((c) => c?.status === "running")?.id ?? null) : null;

  const nodes: AgentNode[] = useMemo(() => {
    const total = SPECIALISTS.length * (W + 16) - 16;
    const mid = total / 2 - W / 2;
    const list: AgentNode[] = [
      { id: "orchestrator", type: "agent", position: { x: mid, y: 0 }, data: { id: "orchestrator", card: cards.orchestrator, active: false } },
      { id: "analyst", type: "agent", position: { x: mid, y: 110 }, data: { id: "analyst", card: cards.analyst, active: activeId === "analyst" } },
      ...SPECIALISTS.map((id, i) => ({ id, type: "agent" as const, position: { x: i * (W + 16), y: 240 }, data: { id, card: cards[id], active: activeId === id } })),
      { id: "human", type: "agent", position: { x: mid, y: 380 }, data: { id: "human", human: true, humanState: humanState(run), active: run.status === "AWAITING_DECISION" } },
    ];
    return list;
  }, [cards, activeId, run]);

  const edges: Edge[] = useMemo(() => {
    const accent = "var(--agent)";
    const quiet = "var(--border-strong)";
    const e: Edge[] = [{ id: "o-a", source: "orchestrator", target: "analyst", animated: run.status === "RUNNING", style: { stroke: run.status === "RUNNING" ? accent : quiet, strokeWidth: 1.4 } }];
    for (const id of SPECIALISTS) {
      const on = activeId === id;
      e.push({ id: `a-${id}`, source: "analyst", target: id, animated: on, style: { stroke: on ? accent : quiet, strokeWidth: on ? 2 : 1 } });
    }
    for (const id of ["policy", "memo", "critic"] as AgentId[]) {
      const on = run.status === "AWAITING_DECISION" || run.status === "DECIDED";
      e.push({ id: `${id}-h`, source: id, target: "human", style: { stroke: on ? "var(--foreground)" : quiet, strokeWidth: on ? 1.4 : 1, strokeDasharray: on ? undefined : "4 4" } });
    }
    return e;
  }, [activeId, run.status]);

  return (
    <div className="relative h-[470px] w-full" aria-label="Graful agenților">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false}
        zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false} proOptions={{ hideAttribution: true }}>
        <Background gap={24} size={1} color="var(--grid-strong)" />
      </ReactFlow>
      {lastDispatch && run.status === "RUNNING" && (
        <div className="hud-label pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 text-agent-text">
          <span className="h-1.5 w-1.5 animate-[blink_1.1s_steps(1)_infinite] bg-agent" />{lastDispatch.title}
        </div>
      )}
      {run.status === "FAILED" && (
        <div className="absolute inset-x-3 top-3 flex items-center gap-2 border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" />Procesare eșuată — dosarul nu este considerat verificat.
        </div>
      )}
    </div>
  );
}
