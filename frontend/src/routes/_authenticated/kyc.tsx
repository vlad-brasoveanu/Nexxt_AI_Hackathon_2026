import { createFileRoute, Link } from '@tanstack/react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowUpRight, FileCheck2, FolderOpen, Search, Clock3 } from 'lucide-react';
import { casesQ, creditCasesQ, runsQ } from '@/lib/queries';
import { DISPOSITION, dispKey, RUN_STATUS_META } from '@/lib/labels';
import { fmtRon } from '@/lib/format';
import { Empty, Tag } from '@/components/casecheck/hud';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authenticated/kyc')({component: CaseList});
const FILTERS = [{id:'all',label:'Toate dosarele'},{id:'action',label:'De analizat / verificat'},{id:'waiting',label:'Așteaptă clientul'},{id:'closed',label:'Decise'}] as const;

function CaseList() {
  const cases=useQuery(casesQ()), credit=useQuery(creditCasesQ());
  const legacy=(cases.data??[]).filter(c=>c.kind!=='credit');
  const runs=useQueries({queries:legacy.map(c=>runsQ(c.id))});
  const [filter,setFilter]=useState<string>('all'),[search,setSearch]=useState('');
  const rows=(cases.data??[]).map(c=>{
    const loan=credit.data?.find(l=>l.id===c.id);
    const isCredit=c.kind==='credit';
    const result=runs[legacy.findIndex(l=>l.id===c.id)]?.data?.[0];
    const status=isCredit ? loan?.run ? RUN_STATUS_META[loan.run.status] : {label:loan?'Pregătit pentru analiză':credit.isError?'Stare indisponibilă':'Se încarcă…',tone:credit.isError?'warning' as const:'neutral' as const} : DISPOSITION[dispKey(result?.result?.disposition)]!;
    const group=isCredit ? loan?.run?.status==='DECIDED'?'closed':loan?.run?.status==='WAITING_CLIENT'?'waiting':loan?.run?.status==='RUNNING'?'running':'action' : result?.result?.disposition==='NEEDS_INFORMATION'?'waiting':'action';
    return {c,loan,isCredit,status,group,name:loan?.company??c.title.split(' · ')[0]??c.title};
  });
  const shown=rows.filter(r=>(filter==='all'||r.group===filter)&&`${r.name} ${r.loan?.cui??''} ${r.c.title}`.toLocaleLowerCase('ro').includes(search.toLocaleLowerCase('ro')));
  const loading=cases.isLoading||credit.isLoading;
  return <div className="dossier-page mx-auto max-w-[1440px] space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-sm text-muted-foreground">Portofoliu</p><h1 className="text-[32px] font-semibold leading-tight">Dosare</h1><p className="mt-2 text-muted-foreground">Documente, verificări și decizii pentru fiecare companie.</p></div><label className="relative w-full sm:w-[340px]"><Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground"/><input aria-label="Caută dosare" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Caută firma sau CUI-ul" className="h-12 w-full border bg-card pl-11 pr-4"/></label></header>
    <div className="grid gap-4 sm:grid-cols-3">{[{label:'În portofoliu',value:rows.length,icon:FolderOpen},{label:'De analizat / verificat',value:rows.filter(r=>r.group==='action').length,icon:FileCheck2},{label:'Așteaptă clientul',value:rows.filter(r=>r.group==='waiting').length,icon:Clock3}].map(s=><div key={s.label} className="flex items-center gap-4 rounded-xl border bg-card px-5 py-4"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-agent-soft text-agent-text"><s.icon className="h-5 w-5"/></span><div><p className="text-sm text-muted-foreground">{s.label}</p><p className="num mt-1 text-2xl font-semibold">{loading?'…':s.value}</p></div></div>)}</div>
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Lista dosarelor"><div className="flex flex-wrap gap-2 border-b p-4">{FILTERS.map(f=><button key={f.id} aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)} className={cn('px-3 py-2 text-sm font-medium',filter===f.id?'bg-agent-soft text-agent-text':'text-muted-foreground hover:bg-surface-2')}>{f.label}<span className="ml-2 opacity-70">{f.id==='all'?rows.length:rows.filter(r=>r.group===f.id).length}</span></button>)}</div>
      <div className="dossier-columns hidden border-b bg-surface-2/40 px-6 py-3 text-sm text-muted-foreground md:grid" aria-hidden><span>Companie</span><span>Tip dosar</span><span>Finanțare solicitată</span><span>Stare</span><span/></div>
      <ul className="divide-y">{shown.map(({c,loan,isCredit,status,name})=><li key={c.id}><Link to={isCredit?'/credit/$id':'/cases/$id'} params={{id:c.id}} className="dossier-columns group grid items-center gap-4 px-6 py-5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"><div className="min-w-0"><p className="text-base font-semibold leading-snug">{name}</p><p className="mt-1 text-sm text-muted-foreground">{loan?`CUI ${loan.cui} · ${loan.product??'Credit IMM'}`:isCredit?'Dosar de credit':'Verificarea companiei'}</p></div><span className="hidden text-sm text-muted-foreground md:block">{isCredit?'Credit IMM':'KYC'}</span><div className="hidden md:block">{loan?<><p className="num font-medium">{fmtRon(loan.amount)}</p><p className="mt-1 text-sm text-muted-foreground">{loan.term_months} luni</p></>:<span className="text-sm text-muted-foreground">Nu se aplică</span>}</div><div><Tag tone={status.tone}>{status.label}</Tag></div><ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-agent-text" aria-label="Deschide dosarul"/></Link></li>)}</ul>
      {loading&&<Empty>Se încarcă dosarele…</Empty>}{(cases.isError||credit.isError)&&<p role="alert" className="p-5 text-danger">Lista nu a putut fi încărcată complet. Reîncarcă pagina.</p>}{!loading&&!shown.length&&!cases.isError&&<Empty>Nu există dosare care să corespundă căutării.</Empty>}
    </section>
  </div>;
}
