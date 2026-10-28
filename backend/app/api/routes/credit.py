from app.agents.review import complete, blockers
from app.core.permissions import permissions, role, authority
from app.api.mutations import claim_run, claim_case
"""Human credit decisions (Aprobă / Modifică / Respinge) on authority levels with four eyes, the work queue,
and the demo metrics. Agents never call these endpoints."""
from statistics import median

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.agents.orchestrator import ROLE_FOR_LEVEL
from app.agents.specialists.policy import LABEL, inputs_from_board
from app.api.agent_views import decision_json, latest_run
from app.api.deps import CREDIT_ROLES, DB, Auth
from app.api.routes.agents import credit_case
from app.api.schemas import DecisionRequest
from app.core.audit import audit
from app.credit import policy as engine
from app.credit.numbers import fmt_pct, fmt_ron
from app.db import AgentStep, Case, ClientRequest, CreditDecision

router = APIRouter(prefix="/api/v1", tags=["credit"])
RANK = {"L1": 1, "L2": 2, "L3": 3}
ACTION_LABEL = {"APPROVE": "Aprobă", "MODIFY": "Modifică", "REJECT": "Respinge"}


def letter(case, action, terms, conditions, reasons):
    meta = case.meta or {}
    head = f"CIORNĂ — {meta.get('company', case.title)} · cererea {meta.get('request_id', '')} · date sintetice\n\n"
    if action == "REJECT":
        body = ("Vă mulțumim pentru cererea de finanțare. În urma analizei, banca nu poate acorda în prezent creditul solicitat.\n"
                "Principalele motive: " + "; ".join(reasons[:3]) + ".\nPuteți reveni cu o cerere nouă dacă situația se schimbă.")
    else:
        body = (f"Banca Demo vă propune finanțarea: {fmt_ron(terms['amount'])}, {terms['term_months']} de luni, dobândă variabilă "
                f"{terms['index']} + {fmt_pct(terms['margin_pct'], 2)} (în prezent {fmt_pct(terms['rate_pct'], 2)}), rată lunară estimată "
                f"{fmt_ron(terms['monthly_payment'])}.\nCondiții:\n" + "\n".join(f"• {c}" for c in conditions))
    return head + body + "\n\nCiornă pregătită de agenți. Trimiterea către client rămâne o acțiune umană."


@router.post("/cases/{case_id}/decision", status_code=201)
def decide(case_id: str, body: DecisionRequest, request: Request, identity: Auth, session: DB):
    user = identity[0]
    if not permissions(user)["decide"]:
        raise HTTPException(403, "Doar analiștii de credit, ofițerii de risc și comitetul pot decide")
    case = credit_case(session, user, case_id)
    run = latest_run(session, case_id)
    if not run or run.id != body.run_id:
        raise HTTPException(409, "Decizia trebuie luată pe ultima rulare a agenților")
    if run.status != "AWAITING_DECISION":
        raise HTTPException(409, "Dosarul nu așteaptă o decizie")
    if run.case_revision != case.revision:
        raise HTTPException(409, "Dosarul s-a schimbat după analiză; agenții trebuie să-l re-evalueze")
    rec = run.recommendation
    if not rec or rec["decision"] == "NEEDS_INFORMATION":
        raise HTTPException(409, "Dosarul este incomplet: nu se poate decide")
    claim_case(session, case)
    claim_run(session, run)
    board = run.board
    demo = body.demo_exception
    if demo and not (role(user)=="admin" and request.app.state.settings.demo_simulations and request.app.state.settings.demo_admin_override):
        raise HTTPException(403, "Excepția este disponibilă numai administratorului în demo configurat explicit.")
    if demo and len((body.reason or "").strip()) < 10:
        raise HTTPException(422, "Excepția demo necesită motiv explicit.")
    if not complete(board):
        raise HTTPException(409, "Revizia faptelor de către un analist este necesară înainte de decizie")
    if not demo and user.id in {case.owner_id, run.started_by, *board.get("reviewed_by", [])}:
        raise HTTPException(403, "Regula celor patru ochi: cine a pregătit sau revizuit dosarul nu poate decide")

    if body.action != "REJECT" and blockers(board):
        raise HTTPException(409, {"code": "REVIEW_REQUIRED", "reasons": blockers(board)})

    orchestrator = request.app.state.orchestrator
    _, env, live_board = orchestrator.load(session, run)
    if rec["policy_version"] != env.standards["version"] or rec["market"] != {k: env.market[k] for k in rec["market"]}:
        raise HTTPException(409, "Politica sau dobânda s-a schimbat; reanalizați dosarul.")
    x = inputs_from_board(live_board, env)
    terms, conditions = None, list(rec.get("conditions", []))
    if body.action == "APPROVE":
        if rec["decision"] == "DECLINE":
            terms = engine.terms_for(env.standards, env.market, x, x.amount, x.term_months) if x.cfads is not None and x.ebitda else None
        else:
            proposed = rec.get("proposed") or {}
            terms = engine.terms_for(env.standards, env.market, x, proposed.get("amount", x.amount), proposed.get("term_months", x.term_months))
    elif body.action == "MODIFY":
        if not body.terms:
            raise HTTPException(422, "Modifică necesită suma și durata")
        if x.cfads is None or not x.ebitda:
            raise HTTPException(409, "Indicatorii financiari nu sunt disponibili")
        terms = engine.terms_for(env.standards, env.market, x, body.terms.amount, body.terms.term_months)
        if body.conditions is not None:
            conditions = [c.strip() for c in body.conditions if c.strip()]
    if body.action != "REJECT" and terms is None:
        raise HTTPException(409, "Termenii nu pot fi calculați fără indicatorii financiari")
    level, override, why = engine.required_level(env.standards, rec, body.action, terms, x.group_exposure)
    reason = (body.reason or "").strip()
    if (override or body.action == "MODIFY") and len(reason) < 10:
        raise HTTPException(422, "Motivul este obligatoriu (minimum 10 caractere) când decizia diferă de recomandare")
    if RANK.get(authority(user), 0) < RANK[level]:
        raise HTTPException(403, f"Decizia necesită nivelul {level} ({ROLE_FOR_LEVEL[level]}): {why}")

    vote = {"username": user.username, "role": user.role, "action": body.action, "at": str(env.evaluation_date)}
    pending = session.scalar(select(CreditDecision).where(CreditDecision.run_id == run.id, CreditDecision.status == "PENDING_SECOND_VOTE")) \
        if level == "L3" and not demo else None
    if pending:
        if any(v["username"] == user.username for v in pending.votes):
            raise HTTPException(409, "Al doilea vot trebuie dat de alt membru al comitetului")
        if pending.action != body.action or (pending.terms or {}).get("amount") != (terms or {}).get("amount") \
                or (pending.terms or {}).get("term_months") != (terms or {}).get("term_months"):
            raise HTTPException(409, "Votul diferă de primul vot al comitetului; comitetul trebuie să convină asupra aceleiași decizii")
        pending.votes = pending.votes + [vote]
        pending.status = "FINAL"
        decision, final = pending, True
    else:
        final = level != "L3" or demo
        reasons = [r["text"] for r in rec.get("reasons", [])] or [LABEL[rec["decision"]]]
        decision = CreditDecision(case_id=case.id, run_id=run.id, action=body.action, status="FINAL" if final else "PENDING_SECOND_VOTE",
                                  terms=terms, conditions=conditions if body.action != "REJECT" else [], reason=reason or None,
                                  override=override, demo_exception=demo, level=level, votes=[vote], human_seconds=body.human_seconds,
                                  letter=letter(case, body.action, terms, conditions, reasons), recommendation=rec, case_revision=case.revision)
        session.add(decision)
    if demo:
        decision.letter = "EXCEPȚIE DEMO — fără efect operațional\n" + (decision.letter or "")
    session.flush()
    title = (f"Decizie umană: {ACTION_LABEL[body.action]} · nivel {level} · {user.username}"
             + (f" · {fmt_ron(terms['amount'])}" if terms and body.action != "REJECT" else "")
             + (" · OVERRIDE" if override and body.action != "MODIFY" else ""))
    if final:
        run.status = "DECIDED"
        orchestrator.step(session, run, "human", "decision", title, "ok", thought=reason or None,
                          detail={"action": body.action, "level": level, "override": override, "votes": len(decision.votes)})
    else:
        orchestrator.step(session, run, "human", "decision", f"Vot 1/2 în comitet: {ACTION_LABEL[body.action]} · {user.username}", "info",
                          thought=reason or None, detail={"action": body.action, "level": level})
    audit(session, user, "credit.decision" if final else "credit.vote", case.id, run_id=run.id, decision_action=body.action, level=level,
          override=override, demo_exception=demo, reason=body.reason, decision_id=decision.id)
    session.commit()
    return decision_json(decision)


@router.get("/cases/{case_id}/decision")
def get_decision(case_id: str, identity: Auth, session: DB):
    credit_case(session, identity[0], case_id)
    decision = session.scalar(select(CreditDecision).where(CreditDecision.case_id == case_id).order_by(CreditDecision.created_at.desc()))
    if not decision:
        raise HTTPException(404, "No decision yet")
    return decision_json(decision)


@router.get("/credit-cases")
def queue(identity: Auth, session: DB):
    user = identity[0]
    query = select(Case).where(Case.team == user.team, Case.kind == "credit")
    if user.role == "manager" or user.own_cases_only:
        query = query.where(Case.owner_id == user.id)
    out = []
    for case in session.scalars(query.order_by(Case.created_at.desc()).limit(200)):
        meta, run = case.meta or {}, latest_run(session, case.id)
        summary, waiting, routing = None, None, None
        if run:
            last = session.scalar(select(AgentStep).where(AgentStep.run_id == run.id).order_by(AgentStep.seq.desc()))
            rec = run.recommendation or {}
            summary = {"id": run.id, "status": run.status, "level": run.level, "recommendation": rec.get("decision"),
                       "updated_at": run.updated_at, "last_step": last.title if last else None}
            pending_vote = session.scalar(select(CreditDecision).where(CreditDecision.run_id == run.id, CreditDecision.status == "PENDING_SECOND_VOTE"))
            if run.case_revision != case.revision:
                waiting, routing = "case_officer", "Documente sau politică modificate; reanalizați dosarul."
            elif run.status == "WAITING_CLIENT":
                from app.db import ClientRequest
                draft = session.scalar(select(ClientRequest).where(ClientRequest.run_id == run.id, ClientRequest.status == "DRAFT"))
                waiting, routing = ("case_officer", "Verifică și trimite ciorna solicitării.") if draft else ("client", "Se așteaptă răspunsul clientului.")
            elif run.status == "AWAITING_DECISION" and not complete(run.board or {}):
                waiting, routing = "case_officer", "Faptele extrase așteaptă revizia analistului."
            elif run.status == "AWAITING_DECISION":
                waiting = "risk_reviewer"
                routing = rec.get("level_reason")
        out.append({"id": case.id, "title": case.title, "company": meta.get("company", case.title), "cui": meta.get("cui", ""),
                    "amount": meta.get("amount", 0), "term_months": meta.get("term_months", 0), "product": meta.get("product", ""),
                    "channel": meta.get("channel", "online"), "created_at": case.created_at, "run": summary,
                    "waiting_for": waiting, "routing_reason": routing})
    return out


@router.get("/metrics")
def metrics(request: Request, identity: Auth, session: DB):
    user = identity[0]
    cases = list(session.scalars(select(Case).where(Case.team == user.team, Case.kind == "credit")))
    runs = [r for r in (latest_run(session, c.id) for c in cases) if r]
    rounds = [len(list(session.scalars(select(ClientRequest).where(ClientRequest.case_id == r.case_id)))) for r in runs
              if r.status in {"AWAITING_DECISION", "DECIDED"}]
    all_metrics = [m for r in runs for m in (r.board or {}).get("metrics", {}).values()]
    with_source = [m for m in all_metrics if m.get("sources") or m["agent"] == "policy"]
    steps = list(session.scalars(select(AgentStep).where(AgentStep.run_id.in_([r.id for r in runs])))) if runs else []
    decisions = list(session.scalars(select(CreditDecision).where(CreditDecision.status == "FINAL",
                                                                   CreditDecision.case_id.in_([c.id for c in cases])))) if cases else []
    seconds = [d.human_seconds for d in decisions if d.human_seconds]
    agent_time = [sum((s.duration_ms or 0) for s in steps if s.run_id == r.id) / 1000 for r in runs if r.status in {"AWAITING_DECISION", "DECIDED"}]
    return {"cases": len(cases), "client_rounds_avg": round(sum(rounds) / len(rounds), 2) if rounds else 0,
            "evidence_coverage_pct": round(len(with_source) / len(all_metrics) * 100, 1) if all_metrics else 0,
            "refused_actions": sum(1 for s in steps if s.status == "refused"),
            "injections_ignored": sum(len((r.board or {}).get("security", {}).get("injections", [])) for r in runs),
            "human_seconds_median": median(seconds) if seconds else None,
            "manual_baseline_seconds": request.app.state.sources.baseline().get("manual_baseline_seconds"),
            "agent_seconds_median": round(median(agent_time), 1) if agent_time else None,
            "overrides": sum(1 for d in decisions if d.override)}

