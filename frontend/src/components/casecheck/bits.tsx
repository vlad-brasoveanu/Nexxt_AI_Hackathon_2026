import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DISPOSITION, dispKey, type Tone } from "@/lib/labels";
import type { Disposition, User } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  neutral: "bg-neutral-soft text-neutral border-neutral/30",
};

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function DispositionBadge({ d }: { d: Disposition | undefined }) {
  const x = DISPOSITION[dispKey(d)]!;
  return <Pill tone={x.tone}>{x.label}</Pill>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs text-muted-foreground", className)}>{children}</span>;
}

export const READONLY_TIP = "Rolul de supervizor nu poate modifica dovezile";

export function ReadOnlyBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span><Pill tone="neutral"><Lock className="h-3 w-3" /> Doar citire</Pill></span>
      </TooltipTrigger>
      <TooltipContent>{READONLY_TIP}</TooltipContent>
    </Tooltip>
  );
}

/** Wraps a mutating action; for supervisors disables and adds the read-only tooltip. */
export function Guarded({ user, children }: { user: User; children: (disabled: boolean) => ReactNode }) {
  if (user.role !== "supervisor") return <>{children(false)}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children(true)}</span>
      </TooltipTrigger>
      <TooltipContent>{READONLY_TIP}</TooltipContent>
    </Tooltip>
  );
}

export function Excerpt({ text, start, end, ctx = 120 }: { text: string | undefined; start: number; end: number; ctx?: number }) {
  if (!text) return <span className="text-muted-foreground italic">Text indisponibil</span>;
  const a = Math.max(0, start - ctx);
  const b = Math.min(text.length, end + ctx);
  return (
    // PDF page text breaks lines after nearly every word; collapse whitespace so excerpts stay compact.
    <span className="text-xs leading-relaxed text-muted-foreground whitespace-normal">
      {a > 0 && "…"}
      {text.slice(a, start)}
      <mark className="text-foreground font-medium">{text.slice(start, end)}</mark>
      {text.slice(end, b)}
      {b < text.length && "…"}
    </span>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border bg-card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
