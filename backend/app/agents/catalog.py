"""Task catalogue and the guard. Autonomy is fixed here, in code: what an agent may do on its own, and what only a
human may do. The planner can only order eligible catalogue tasks; anything else is refused and recorded."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Agent:
    id: str
    title: str
    role: str
    tier: str           # model size this agent is routed to: "large", "small" or "none" (deterministic)
    deps: tuple = ()    # board versions that make this agent's output stale when they change


AGENTS = {a.id: a for a in [
    Agent("orchestrator", "Orchestrator", "Plan, stare și gardă de politică; dispecerizează agenții.", "large"),
    Agent("analyst", "Analist financiar", "Sinteză pe baza cazurilor istorice și a statisticilor de sector.", "none",
          ("financials", "cashflow", "kyb", "market")),
    Agent("completeness", "Agent Completitudine", "Ce lipsește din dosar; cere automat documentele, într-o singură cerere.", "small",
          ("documents", "requests")),
    Agent("financials", "Agent Situații financiare", "Extrage, normalizează și calculează indicatorii.", "small",
          ("doc:financial_statements", "doc:collateral_valuation", "review")),
    Agent("cashflow", "Agent Fluxuri de numerar", "Extrase de cont: venituri, cheltuieli, concentrarea clienților.", "none",
          ("doc:bank_statement", "financials")),
    Agent("kyb", "Agent KYB/Diligență", "Asociați, beneficiari reali, entități afiliate, expunere de grup.", "none",
          ("doc:credit_application", "doc:company_extract", "doc:identity", "doc:ownership", "doc:articles")),
    Agent("policy", "Agent Politică", "Verifică dosarul față de normele de creditare (date versionate, nu prompt).", "none",
          ("financials", "cashflow", "kyb", "analyst", "completeness", "market", "requests", "review")),
    Agent("memo", "Agent Memo", "Redactează nota de credit cu referințe la sursă.", "large", ("policy", "analyst")),
    Agent("critic", "Agent Critic", "Contestă concluziile, caută contradicții, cere re-verificări.", "none",
          ("financials", "cashflow", "kyb", "policy", "memo", "completeness")),
]}

# Tasks the planner may schedule. All are automatic and reversible: they read, compute, draft or ask the client
# for documents through the (simulated) portal. None of them decides the credit.
TASKS = {
    "completeness.check": ("completeness", "Verifică documentele obligatorii și caută instrucțiuni ascunse"),
    "financials.analyze": ("financials", "Extrage situațiile financiare și calculează indicatorii"),
    "cashflow.analyze": ("cashflow", "Analizează extrasele de cont și reconciliază încasările"),
    "kyb.investigate": ("kyb", "Registru, beneficiari, afiliați, Biroul de Credit, sancțiuni, KYC"),
    "analyst.synthesize": ("analyst", "Compară cu sectorul și cu cazurile istorice similare"),
    "policy.evaluate": ("policy", "Evaluează regulile de creditare, prețul și nivelul de competență"),
    "memo.draft": ("memo", "Redactează nota de credit cu referințe la sursă"),
    "critic.review": ("critic", "Contestă concluziile și caută contradicții între agenți"),
    "client.request": ("completeness", "Trimite clientului o singură cerere consolidată (portal simulat)"),
    "route.decision": ("orchestrator", "Rutează dosarul la decidentul uman cu competența necesară"),
}

# Never executable by any agent, whatever the planner, a document or a prompt says.
FORBIDDEN = {
    "loan.approve": "Aprobarea creditului este o decizie umană, pe niveluri de competență.",
    "loan.reject": "Respingerea creditului este o decizie umană.",
    "loan.decide": "Decizia de creditare aparține exclusiv analistului uman.",
    "policy.change": "Politica de creditare se schimbă doar prin versiuni aprobate, nu de agenți.",
    "evidence.delete": "Dovezile nu pot fi șterse sau modificate de agenți.",
    "client.contact_external": "Clientul este contactat doar prin portal, cu cereri consolidate.",
}


def authorize(task: str, eligible: set[str]) -> tuple[bool, str]:
    if task in FORBIDDEN:
        return False, FORBIDDEN[task]
    if task not in TASKS:
        return False, "Sarcină necunoscută: nu există în catalogul aprobat."
    if task not in eligible:
        return False, "Sarcina nu este eligibilă acum (lipsesc premisele sau nu există date noi)."
    return True, ""
