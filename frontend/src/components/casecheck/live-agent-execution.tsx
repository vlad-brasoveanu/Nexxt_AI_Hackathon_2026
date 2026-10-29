import { ArrowDown, ArrowRight, CheckCircle2, CircleDashed, Loader2, Lock, RefreshCw, Workflow, XCircle } from 'lucide-react';
import type { AgentId, AgentRun } from '@/lib/agent-types';
import { agentShort } from '@/lib/labels';
import { executionState, EXECUTION_AGENTS } from '@/lib/agent-execution';
import { cn } from '@/lib/utils';
import { Timeline } from './timeline';

const stateIcon={idle:CircleDashed,running:Loader2,done:CheckCircle2,stale:RefreshCw,failed:XCircle,blocked:Lock};
const stateLabel={idle:'În așteptare',running:'În lucru',done:'Finalizat',stale:'De actualizat',failed:'Eroare',blocked:'Blocat'};
const stateColour={idle:'text-muted-foreground',running:'text-agent-text',done:'text-success',stale:'text-warning',failed:'text-danger',blocked:'text-danger'};
const labels:Partial<Record<AgentId,string>>={completeness:'Documente',financials:'Situații financiare',cashflow:'Fluxuri de numerar',kyb:'Verificarea companiei',analyst:'Analist financiar',policy:'Reguli de credit',memo:'Nota de credit',critic:'Controlul analizei'};

export function LiveAgentExecution({run,onSelect}:{run:AgentRun|null;onSelect?:(id:AgentId)=>void}) {
 const state=executionState(run);
 const live=run?.status==='RUNNING';
 const dispatch=state.lastDispatch;
 const headline=!run?'Analiza nu a fost pornită':live?'Analiză în desfășurare':run.status==='FAILED'?'Analiza a fost întreruptă':!run.is_current?'Analiza trebuie actualizată':run.status==='WAITING_CLIENT'?'Se așteaptă completări':'Analiza agenților s-a încheiat';
 return <section className="live-execution" aria-label="Activitatea agenților">
   <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4"><div><h2 className="text-lg font-semibold">Cum lucrează agenții</h2><p role={run?.status==='FAILED'?'alert':undefined} className={cn("mt-1 text-sm",run?.status==='FAILED'?"text-danger":run&&!run.is_current?"text-warning":"text-muted-foreground")} aria-live="polite">{headline}</p></div><span className="num text-sm text-muted-foreground">{state.completed} / {EXECUTION_AGENTS.length} verificări</span></header>
   <div className="execution-layout">
     <div className="execution-map">
       <div className="execution-coordinator"><Workflow className="h-5 w-5 text-muted-foreground" aria-hidden/><div><h3 className="font-medium">Coordonator</h3><p className="mt-1 text-sm text-muted-foreground">{live?'Alege verificările și distribuie sarcinile':'Organizează analiza și solicită verificări suplimentare.'}</p></div>{live&&<Loader2 className="h-4 w-4 animate-spin text-agent-text" aria-label="Coordonare în curs"/>}</div>
       <div className="execution-handoff" aria-live="polite"><ArrowDown className="h-4 w-4 shrink-0" aria-hidden/><span>{state.active?<>Sarcină în lucru: <strong className="font-medium text-foreground">{labels[state.active]??agentShort(state.active)}</strong></>:live?'Coordonatorul stabilește următoarea sarcină.':!run?'Verificările vor apărea pe măsură ce pornește analiza.':'Delegările, reluările și rezultatele sunt păstrate în istoricul alăturat.'}</span></div>
       <div className="execution-agent-grid">{EXECUTION_AGENTS.map(id=>{
         const status=state.states[id],Icon=stateIcon[status];
         const isActive=state.active===id;
         return <button key={id} className={cn('execution-agent',isActive&&'is-running')} onClick={()=>onSelect?.(id)} disabled={!run} aria-label={`${labels[id]}: ${stateLabel[status]}. Vezi rezultatele`}>
           <span className="text-sm font-medium">{labels[id]}</span><span className={cn('mt-3 flex items-center gap-2 text-sm',stateColour[status])}><Icon className={cn('h-4 w-4 shrink-0',status==='running'&&live&&'animate-spin')} aria-hidden/>{stateLabel[status]}</span>
         </button>;
       })}</div>
       {dispatch?.thought&&<details className="mt-4 border-t pt-2 text-sm text-muted-foreground"><summary>De ce a fost aleasă ultima verificare?</summary><p className="mt-2 leading-relaxed">{dispatch.thought}</p></details>}
       {run&&<details className="technical-details"><summary>Detalii tehnice ale procesării</summary><p className="mt-2">{run.mode_label}</p></details>}
     </div>
     <div className="execution-events"><h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden/>Pașii execuției</h3><div className="execution-event-list"><Timeline steps={run?.steps??[]} live compact limit={12}/></div>{run&&run.steps.length>12&&<details className="mt-3 text-sm text-muted-foreground"><summary>Toți pașii ({run.steps.length})</summary><Timeline steps={run.steps} live compact/></details>}</div>
   </div>
 </section>;
}
