import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Evidence } from '@/lib/types';
import { PdfFrame, TextFrame, type CaseDoc } from './evidence';

export function SourceDialog({doc,evidence,label,onClose}:{doc:CaseDoc;evidence:Evidence;label:string;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=ref.current!;node.showModal();return()=>node.close();},[]);
 const pdf=doc.media_type==='application/pdf'||doc.filename.toLowerCase().endsWith('.pdf');
 return <dialog ref={ref} className="source-dialog" aria-labelledby="source-dialog-title" onCancel={e=>{e.preventDefault();onClose();}}>
   <header className="flex items-start justify-between gap-4 border-b p-5"><div><p className="text-sm text-muted-foreground">{label} · pagina {evidence.page}</p><h2 id="source-dialog-title" className="mt-1 text-xl font-semibold">{doc.filename}</h2></div><button autoFocus aria-label="Închide documentul" className="rounded-lg border p-2" onClick={onClose}><X className="h-5 w-5"/></button></header>
   <div className="space-y-3 p-4"><p className="text-sm text-muted-foreground">Fragment preluat: <mark>{evidence.quote}</mark></p>{pdf?<PdfFrame doc={doc} page={evidence.page} ev={evidence}/>:<TextFrame doc={doc} ev={evidence}/>}</div>
 </dialog>;
}
