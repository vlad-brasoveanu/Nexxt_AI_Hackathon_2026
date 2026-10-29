// The employee flow for one credit case: where the file is, and the one thing the current user should do next.
import { Check, Loader2 } from "lucide-react";
import type { AgentRun } from "@/lib/agent-types";
import { LEVEL_RANK, LEVEL_ROLE, ROLE_RANK, roleLabel } from "@/lib/labels";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CaseTab = "agents" | "review" | "decision" | "profile" | "risk";

export const isReviewed = (run: AgentRun) => run.review_complete ?? (run.board.facts.length > 0 && run.steps.some((s) => s.agent === "human" && s.title.startsWith("Revizie")) && run.board.facts.every((f) => f.review === "accepted" || f.review === "corrected"));
const isPreparer = (u: User) => u.permissions?.edit_case ?? (u.role === "manager" || u.role === "analyst");

type StepState = "done" | "current" | "todo" | "skipped";
type Step = { label: string; who: string; state: StepState };

export function flowSteps(run: AgentRun | null): Step[] {
  const status = run?.status;
  const asked = ((run?.request_history ?? run?.requests)?.length ?? 0) > 0;
  const reviewed = run ? run.is_current && isReviewed(run) : false;
  const level = run?.recommendation?.level;
  const decisionDone = status === "DECIDED";
  return [
    { label: "Documente", who: "Ofițer dosar", state: run ? "done" : "current" },
    { label: "Analiza agenților", who: "Agenți", state: !run ? "todo" : status === "FAILED" || !run?.is_current || (status === "RUNNING" && !asked) ? "current" : "done" },
    { label: "Documente de la client", who: "Client", state: !asked ? (status && status !== "RUNNING" ? "skipped" : "todo") : status === "WAITING_CLIENT" ? "current" : "done" },
    { label: "Verificarea datelor", who: "Ofițer dosar", state: reviewed ? "done" : status === "AWAITING_DECISION" ? "current" : "todo" },
    { label: "Decizia de credit", who: level ? LEVEL_ROLE[level].label : "Decident", state: decisionDone ? "done" : status === "AWAITING_DECISION" && reviewed ? "current" : "todo" },
  ];
}

export type NextAction = { title: string; detail: string; tab?: CaseTab; action?: "start" | "client" | "send"; mine: boolean };

export function nextAction(run: AgentRun | null, user: User): NextAction {
  if (!run) return isPreparer(user)
    ? { title: "Pornește analiza", detail: "Verifică documentele și datele financiare ale dosarului.", action: "start", mine: true }
    : { title: "Dosarul așteaptă analiza", detail: "Ofițerul de dosar începe verificarea.", mine: false };
  if (run.status === "FAILED") return {title:"Analiza nu a putut fi finalizată",detail:"Verifică eroarea de procesare și reîncearcă analiza.",action:isPreparer(user)?"start":undefined,mine:isPreparer(user)};
  if (!run.is_current && run.status !== "RUNNING") return {title:"Reanalizează dosarul",detail:"Documentele sau regulile au fost actualizate.",action:isPreparer(user)?"start":undefined,mine:isPreparer(user)};
  if (run.status === "WAITING_CLIENT" && run.requests.at(-1)?.status === "DRAFT") return {title:"Verifică solicitarea către client",detail:"Ciorna este pregătită. Citește mesajul înainte de trimitere.",action:isPreparer(user)?"send":undefined,tab:"agents",mine:isPreparer(user)};
  switch (run.status) {
    case "RUNNING":
      return { title: "Analiză în curs", detail: "Rezultatele vor apărea aici când analiza se încheie.", tab: "agents", mine: false };
    case "WAITING_CLIENT":
      return { title: "Se așteaptă documentele clientului", detail: "Solicitarea a fost trimisă. Încarcă documentele primite, apoi reanalizează dosarul.", tab: "agents", mine: false };
    case "AWAITING_DECISION": {
      if (!isReviewed(run)) return isPreparer(user)
        ? { title: "Verifică datele din documente", detail: "Compară valorile cu documentele și confirmă-le sau corectează-le.", tab: "review", mine: true }
        : { title: "Se așteaptă verificarea faptelor", detail: "Analistul confirmă datele înainte de decizie.", tab: "review", mine: false };
      const level = run.recommendation?.level ?? "L1";
      const rank = user.authority_level ? LEVEL_RANK[user.authority_level] : ROLE_RANK[user.role];
      const can = !!rank && rank >= LEVEL_RANK[level] && run.prepared_by !== user.username;
      return can
        ? { title: "Dosarul așteaptă decizia ta", detail: "Verifică recomandarea și alege decizia potrivită.", tab: "decision", mine: true }
        : { title: `Se așteaptă decizia: ${LEVEL_ROLE[level].label}`, detail: rank ? "Decizia necesită un coleg cu drept de aprobare pentru acest dosar." : "Decizia o ia un decident de credit.", tab: "decision", mine: false };
    }
    case "DECIDED":
      return { title: "Dosar decis", detail: "Decizia și ciorna scrisorii sunt în tab-ul Decizie.", tab: "decision", mine: false };
    default:
      return { title: "Procesare eșuată", detail: "Dosarul nu este considerat verificat. Agenții trebuie reporniți.", tab: "agents", mine: false };
  }
}

export function FlowBar({ run }: { run: AgentRun | null }) {
  const steps = flowSteps(run);
  return (
    <ol className="case-flow border bg-card" aria-label="Etapele dosarului">
      {steps.map((s, i) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined}
          className={cn("flex items-center gap-3 border-r px-4 py-3 last:border-r-0", s.state === "current" && "bg-surface-2", s.state === "skipped" && "opacity-50")}>
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center border text-[14px] font-semibold",
            s.state === "done" && "border-success bg-success-soft text-success",
            s.state === "current" && "border-human bg-human text-human-foreground",
            (s.state === "todo" || s.state === "skipped") && "border-border-strong text-muted-foreground")}>
            {s.state === "done" ? <Check className="h-4 w-4" /> : s.state === "current" && s.who === "Agenți" && run?.status === "RUNNING" ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className={cn("block text-[15px]", s.state === "current" ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
            <span className="block text-sm text-muted-foreground">{s.state === "skipped" ? "nu a fost nevoie" : s.who}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
