import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, isMock } from '@/lib/api';
import type { AgentRun } from '@/lib/agent-types';
import { fmtInt, fmtX, fmtPct, fmtRon } from '@/lib/format';
import { Panel, Tag } from './hud';

const outcomes:Record<string,string>={CLOSED_OK:'Încheiat fără probleme',LATE_RECOVERED:'Întârziere recuperată',RESTRUCTURED:'Restructurat',NPL_DEFAULT:'Nerambursare',INSOLVENCY:'Insolvență',UNOBSERVED:'Rezultat încă neobservat'};
const features:Record<string,string>={ebitda_margin_pct:'Marjă EBITDA (%)',current_ratio:'Lichiditate',revenue_growth_pct:'Evoluția veniturilor (%)',years_in_business:'Vechime (ani)',employees:'Angajați'};
const input='mt-1 w-full border bg-surface-1 px-3 py-2';
export function RiskPlanner({run,caseId,onReview}:{run:AgentRun;caseId:string;onReview:()=>void}) {
  const qc=useQueryClient();const [drop,setDrop]=useState(10);const [shock,setShock]=useState(2);
  const reports=useQuery({queryKey:['risk-reports',caseId,run.updated_at],queryFn:()=>api.riskReports(caseId),enabled:!isMock()});
  const simulate=useMutation({mutationFn:()=>api.riskPlanner(run.id,{cfads_drop_pct:drop,rate_shock_pp:shock}),
    onSuccess:()=>qc.invalidateQueries({queryKey:['risk-reports',caseId]}),onError:(e:Error)=>toast.error(e.message)});
  const report=reports.data?.[0];
  const ready=run.is_current && ['AWAITING_DECISION','WAITING_CLIENT'].includes(run.status);
  return <div className="space-y-5">
    <Panel title="Risk Planner">
      <p className="text-muted-foreground">Compară variantele de finanțare și rezistența lor la scăderea fluxului de numerar.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label>Reducere flux disponibil (%)<input aria-label="Reducere flux disponibil" type="number" min="0" max="80" value={drop} onChange={e=>setDrop(Number(e.target.value))} className={input}/></label>
        <label>Șoc de dobândă (puncte procentuale)<input aria-label="Șoc de dobândă" type="number" min="0" max="20" step="0.25" value={shock} onChange={e=>setShock(Number(e.target.value))} className={input}/></label>
        <button disabled={!ready||simulate.isPending||isMock()} onClick={()=>simulate.mutate()} className="self-end bg-agent px-4 py-3 font-medium text-agent-foreground disabled:opacity-50">{simulate.isPending?'Calculez…':'Calculează scenariile'}</button>
      </div>
      {!ready&&<p className="mt-3 text-warning"><AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden/>Finalizează sau actualizează analiza înainte de calcularea scenariilor.</p>}
      {isMock()&&<p className="mt-3 text-warning">Serviciul de analiză nu este disponibil în această conexiune.</p>}
      {reports.isError&&<p className="mt-3 text-danger">Rapoartele nu au putut fi încărcate.</p>}
    </Panel>
    {report&&<>
      {report.is_current===false&&<p role="alert" className="border border-warning p-4 text-warning"><AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden/>Raport anterior — recalculează pentru datele și politica actuale.</p>}
      {report.blockers.length>0&&<Panel title="Ce trebuie verificat"><ul className="list-disc space-y-1 pl-5">{report.blockers.map(b=><li key={b}>{b}</li>)}</ul><button onClick={onReview} className="mt-3 border px-3 py-2">Deschide verificarea faptelor</button></Panel>}
      <div className="grid gap-4 lg:grid-cols-3">{report.scenarios.map(s=><Panel key={s.id} title={s.id==='requested'?'Creditul solicitat':`Capacitate la ${s.terms.term_months} luni`} eyebrow={report.recommended===s.id?'Varianta recomandată':'Scenariu'}>
        <p className="text-2xl font-medium">{fmtRon(s.terms.amount)}</p><p className="mt-1 text-muted-foreground">{s.terms.term_months} luni · {fmtPct(s.terms.rate_pct,2)} / an</p>
        <dl className="mt-4 space-y-2"><div className="flex justify-between"><dt>Rată lunară</dt><dd>{fmtRon(s.terms.monthly_payment)}</dd></div><div className="flex justify-between"><dt title="Flux disponibil pentru rambursare / serviciul datoriei">DSCR</dt><dd>{fmtX(s.terms.dscr)}</dd></div><div className="flex justify-between"><dt>DSCR cu ambele șocuri</dt><dd className="text-warning">{fmtX(s.stressed.dscr_stressed)}</dd></div><div className="flex justify-between"><dt title="Credit raportat la valoarea garanției">LTV</dt><dd>{s.terms.ltv_pct==null?'Fără garanție':fmtPct(s.terms.ltv_pct)}</dd></div></dl>
        <div className="mt-4"><Tag tone={s.eligible?'success':'warning'}>{s.eligible?'Eligibil conform regulilor':'Necesită verificare / ajustare'}</Tag></div>
        <details className="mt-3 text-sm"><summary className="cursor-pointer">Motive și condiții</summary><ul className="mt-2 space-y-2">{s.reasons.map(r=><li key={r.code}>{r.text}</li>)}</ul></details>
      </Panel>)}</div>
      <Panel title="Ce arată istoricul" eyebrow={`${report.history.n} comparabile · ${report.history.cohort_size} cazuri în cohorta RO`}>
        {report.history.limited && <p role="alert" className="mt-2 text-sm text-warning"><AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden/>Comparație limitată: sunt disponibile {report.history.n} cazuri apropiate. Solicită verificări suplimentare înainte de decizie.</p>}<p className="mt-2 text-sm text-muted-foreground">Rezultatele istorice descriu cazurile selectate; nu reprezintă probabilitatea de nerambursare a acestui solicitant.</p>
        <div className="mt-4 flex flex-wrap gap-3">{report.history.outcomes.map(o=><div key={o.outcome} className="border bg-surface-1 px-4 py-3"><div className="text-sm text-muted-foreground">{outcomes[o.outcome]??o.outcome}</div><strong>{o.count} cazuri · {fmtPct(o.share_pct)}</strong></div>)}</div>
        <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Caz / an</th><th>Suma (EUR)</th><th>Durată</th><th>Rezultat înregistrat</th><th>Detalii</th></tr></thead><tbody>{report.history.comparables.map(c=><tr key={c.case_id} className="border-b align-top"><td className="p-2">#{c.case_id} · {c.year}</td><td>{fmtInt(c.amount)} EUR</td><td>{c.term_months} luni</td><td>{outcomes[c.outcome]??c.outcome}<p className="text-xs text-muted-foreground">{c.months_to_event==null?"Rezultat ulterior datei de analiză":`Eveniment la ${c.months_to_event} luni`}</p></td><td><details><summary className="cursor-pointer">De ce este similar?</summary><dl className="my-2 space-y-1">{Object.entries(c.features).map(([k,v])=><div key={k}><dt>{features[k]??k}</dt><dd>{v.toFixed(2)} · solicitant {report.history.applicant[k]?.toFixed(2)}</dd></div>)}</dl><p className="break-all text-xs">Sursă: {report.history.dataset.id}, cazul {c.case_id}. Distanță: {c.distance} (mai mică = mai apropiat).</p></details></td></tr>)}</tbody></table></div>
        <details className="mt-4 text-sm text-muted-foreground"><summary className="cursor-pointer">Proveniență și limite</summary><p>{report.history.note}</p><p>{report.history.limitation}</p><p className="mt-2 break-all">Dataset {report.history.dataset.id} · SHA256 {report.history.dataset.sha256}</p><p>{report.history.dataset.valid} înregistrări valide; {report.history.dataset.excluded} excluse. Sumele istorice sunt în EUR, dosarul curent în RON; nu sunt comparate direct.</p><p>Rezultate observabile la {report.history.as_of}: {report.history.observed_n}; neobservate: {report.history.unobserved_n}. Data acordării este aproximată conservator la sfârșitul anului. Politică {report.policy_version}. Reducere flux {report.assumptions.cfads_drop_pct}%, șoc dobândă {report.assumptions.rate_shock_pp} pp.</p><p>{report.note}</p></details>
      </Panel>
    </>}
  </div>;
}
