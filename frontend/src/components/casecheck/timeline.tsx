// Live timeline of agent steps. New steps flow in; a refused action glitches and gets the policy stamp.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Ban, ChevronRight, GitPullRequestArrow, Gavel, Inbox, ListChecks, Send, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react";
import type { AgentStep } from "@/lib/agent-types";
import { STEP_KIND_LABEL, agentShort } from "@/lib/labels";
import { fmtClockTime, fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ModelChip } from "./hud";

const KIND_ICON = {
  plan: ListChecks, dispatch: Send, result: Sparkles, challenge: GitPullRequestArrow, refused: Ban,
  event: ChevronRight, request: Inbox, decision: Gavel, error: TriangleAlert,
} as const;

function tone(step: AgentStep) {
  if (step.status === "refused") return "refused";
  if (step.kind === "challenge") return "challenge";
  if (step.agent === "human") return "human";
  if (step.status === "failed") return "failed";
  if (step.status === "warning") return "warning";
  if (step.kind === "dispatch") return "dispatch";
  return "ok";
}

const ROW: Record<string, string> = {
  refused: "border-danger bg-danger-soft",
  challenge: "border-violet/70 bg-violet-soft",
  human: "border-human",
  failed: "border-danger",
  warning: "border-border",
  dispatch: "border-transparent",
  ok: "border-border",
};
const ACCENT: Record<string, string> = {
  refused: "text-danger", challenge: "text-violet", human: "text-foreground", failed: "text-danger",
  warning: "text-warning", dispatch: "text-muted-foreground", ok: "text-agent-text",
};

export function Timeline({ steps, compact, limit }: { steps: AgentStep[]; compact?: boolean; limit?: number }) {
  const reduced = useReducedMotion();
  const shown = [...steps].reverse().slice(0, limit ?? steps.length);
  return (
    <ol className="space-y-1.5" aria-live="polite">
      <AnimatePresence initial={false}>
        {shown.map((step) => {
          const t = tone(step);
          const Icon = step.status === "refused" ? ShieldAlert : KIND_ICON[step.kind] ?? ChevronRight;
          return (
            <motion.li key={step.seq} layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              className={cn("relative border-l-2 border px-3 py-2", ROW[t], t === "dispatch" && "py-1.5", t === "refused" && !reduced && "animate-glitch")}>
              <div className="flex items-start gap-2.5">
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", ACCENT[t])} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("hud-label text-[12px]", ACCENT[t])}>{STEP_KIND_LABEL[step.kind]}</span>
                    <span className="hud-label text-[12px] text-muted-foreground">{agentShort(step.agent)}</span>
                    {!compact && <ModelChip model={step.model} />}
                    <span className="num ml-auto text-[12px] text-muted-foreground">
                      {step.duration_ms != null && step.kind !== "dispatch" && <>{fmtMs(step.duration_ms)} · </>}{fmtClockTime(step.created_at)}
                    </span>
                  </div>
                  <div className={cn("mt-0.5 text-[15px] leading-snug", t === "dispatch" ? "text-muted-foreground" : "text-foreground")}>{step.title}</div>
                  {step.thought && !compact && t !== "dispatch" && (
                    <p className="num mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.thought}</p>
                  )}
                </div>
              </div>
              {t === "refused" && (
                <span className={cn("hud-label pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border-2 border-danger px-2 py-1 text-[12px] text-danger", !reduced && "animate-stamp")}>
                  Blocat de politică
                </span>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
