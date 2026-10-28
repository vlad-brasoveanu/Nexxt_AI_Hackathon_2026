"""Bounded deterministic simulations. Historical outcomes never price or authorize credit."""
from copy import deepcopy
from dataclasses import replace
from app.agents.review import blockers
from app.agents.specialists.policy import inputs_from_board
from app.credit import policy
from app.risk.history import applicant_from_board, compare, load


def build(board, env, cfads_drop_pct=10, rate_shock_pp=None, history_path=None):
    history=compare(load(history_path),env.case['meta'].get('caen'),env.case['meta'].get('product'),applicant_from_board(board), env.evaluation_date)
    x=inputs_from_board(board,env)
    rules=deepcopy(env.standards)
    if rate_shock_pp is not None:
        rules['pricing']['stress_shock_pp']=rate_shock_pp
    reasons=blockers(board)
    if history["limited"]:
        reasons.append("Comparația istorică este insuficientă; este necesară verificarea analistului de risc.")
    if x.cfads is None or x.ebitda is None or x.ebitda<=0 or x.net_debt is None or x.existing_service is None:
        reasons.append('Indicatori financiari esențiali lipsă sau EBITDA nepozitiv.')
    if not env.standards['product']['min_term_months']<=x.term_months<=env.standards['product']['max_term_months']:
        reasons.append('Durata cerută este în afara politicii produsului.')
    base={'history':history,'currency':'RON','policy_version':env.standards['version'],'case_revision':env.case['revision'],
          'market':env.market,'assumptions':{'cfads_drop_pct':cfads_drop_pct,'rate_shock_pp':rules['pricing']['stress_shock_pp']},
          'blockers':list(dict.fromkeys(reasons)),'scenarios':[],'recommended':None,
          'note':'Simulare deterministă, nu ofertă de credit. Decizia este umană. CFADS = EBITDA − impozit, aproximație de demo.'}
    if x.cfads is None or not x.ebitda or x.ebitda<=0 or x.existing_service is None or x.net_debt is None:
        return base
    durations=sorted({x.term_months,min(x.term_months+12,rules['product']['max_term_months'])})
    variants=[('requested',x.amount,x.term_months)]
    def passes_stress(amount, months):
        terms=policy.terms_for(rules,env.market,x,amount,months)
        stressed=policy.terms_for(rules,env.market,replace(x,cfads=x.cfads*(1-cfads_drop_pct/100)),amount,months)
        return terms['passes'] and stressed['dscr_stressed']>=rules['thresholds']['dscr_stressed_min']
    def capacity(months):
        step=rules['pricing']['rounding_ron']
        low,high=0,int(x.amount//step)
        while low<high:
            middle=(low+high+1)//2
            if passes_stress(middle*step,months):low=middle
            else:high=middle-1
        return low*step
    for months in durations:
        amount=capacity(months)
        if amount>0:
            variants.append((f'capacity_{months}',amount,months))
    for label,amount,months in variants:
        candidate=replace(x,amount=amount,term_months=months)
        evaluation=policy.evaluate(rules,env.market,candidate)
        terms=policy.terms_for(rules,env.market,candidate,amount,months)
        stressed=policy.terms_for(rules,env.market,replace(candidate,cfads=x.cfads*(1-cfads_drop_pct/100)),amount,months)
        eligible=not reasons and evaluation['decision'] in {'APPROVE','APPROVE_WITH_CONDITIONS'} and terms['passes'] and stressed['dscr_stressed']>=rules['thresholds']['dscr_stressed_min']
        base['scenarios'].append({'id':label,'terms':terms,'stressed':stressed,'eligible':eligible,
                                  'decision':evaluation['decision'],'reasons':evaluation['reasons']})
    feasible=[s for s in base['scenarios'] if s['eligible']]
    if feasible:
        base['recommended']=max(feasible,key=lambda s:(s['terms']['amount'],-s['terms']['term_months']))['id']
    return base
