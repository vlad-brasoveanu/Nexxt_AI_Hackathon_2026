// HUD primitives for the agent control room: outlined panels with cut corners, mono labels, tone tags.
import type { ReactNode } from "react";
import { Bot, Cpu, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PillTone } from "@/lib/labels";
import { TIER_META } from "@/lib/labels";
import type { ModelUse, Tier } from "@/lib/agent-types";
import { shortModel } from "@/lib/format";

const TAG: Record<PillTone, string> = {
  success: "border-success/50 text-success bg-success-soft",
  warning: "border-warning/50 text-warning bg-warning-soft",
  danger: "border-danger/60 text-danger bg-danger-soft",
  neutral: "border-border-strong text-muted-foreground bg-surface-2",
  info: "border-cyan/50 text-cyan bg-cyan-soft",
  violet: "border-violet/50 text-violet bg-violet-soft",
  agent: "border-agent-border text-agent-text bg-agent-soft",
  human: "border-human text-human-foreground bg-human",
};

export function Tag({ tone = "neutral", children, className, title }: { tone?: PillTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("hud-label inline-flex items-center gap-1.5 whitespace-nowrap border px-1.5 py-1", TAG[tone], className)}>
      {children}
    </span>
  );
}

export function HudLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("hud-label text-muted-foreground", className)}>{children}</span>;
}

export function Panel({ eyebrow, title, actions, children, className, bodyClassName, agent, id }: {
  eyebrow?: ReactNode; title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; agent?: boolean; id?: string;
}) {
  return (
    <section id={id} className={cn("hud-cut border bg-card", agent && "hud-cut-agent border-agent-border", className)}>
      {(eyebrow || title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 space-y-1">
            {eyebrow && <HudLabel className={agent ? "text-agent-text" : undefined}>{eyebrow}</HudLabel>}
            {title && <h3 className="truncate text-[15px] font-medium leading-tight">{title}</h3>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, big }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "agent" | "danger" | "success" | "warning"; big?: boolean }) {
  const color = tone === "agent" ? "text-agent-text" : tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="min-w-0 space-y-1.5">
      <HudLabel>{label}</HudLabel>
      <div className={cn("num font-medium leading-none tracking-tight", big ? "text-[40px]" : "text-2xl", color)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  const meta = TIER_META[tier];
  return (
    <span title={meta.label} className={cn("hud-label inline-flex items-center gap-1 border px-1 py-0.5 text-[9.5px]",
      tier === "large" ? "border-agent-border text-agent-text" : tier === "small" ? "border-cyan/50 text-cyan" : "border-border-strong text-muted-foreground")}>
      <Cpu className="h-2.5 w-2.5" />{meta.short}
    </span>
  );
}

export function ModelChip({ model }: { model: ModelUse | null }) {
  if (!model) return null;
  return (
    <span className="num inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={`${model.provider} · ${model.model}`}>
      <TierBadge tier={model.tier} />
      {model.mode === "deterministic" ? "determinist" : shortModel(model.model)}
      {model.error && <span className="text-danger">· eroare</span>}
    </span>
  );
}

export function Actor({ human }: { human?: boolean }) {
  return human
    ? <Tag tone="human"><UserIcon className="h-3 w-3" />OM</Tag>
    : <Tag tone="agent"><Bot className="h-3 w-3" />AGENT</Tag>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num inline-flex h-5 min-w-5 items-center justify-center border border-border-strong bg-surface-2 px-1 text-[10.5px] text-muted-foreground">{children}</kbd>;
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hatch border border-dashed px-4 py-8 text-center text-sm text-muted-foreground", className)}>{children}</div>;
}

/** A thin meter: value / max with a threshold tick. */
export function Meter({ value, max, tone = "agent", label }: { value: number; max: number; tone?: "agent" | "danger" | "warning"; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  const bar = tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-agent";
  return (
    <div className="space-y-1" aria-label={label} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-1.5 w-full border border-border bg-surface-2">
        <div className={cn("h-full transition-[width] duration-500", bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
