import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Minus, Plus } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { documentQ } from '@/lib/queries';
import type { Evidence } from '@/lib/types';
import { locateEvidence } from '@/lib/evidence-highlight';

GlobalWorkerOptions.workerSrc = workerUrl;
const assets = { ...import.meta.glob('/node_modules/pdfjs-dist/standard_fonts/*', { eager:true,query:'?url',import:'default' }), ...import.meta.glob('/node_modules/pdfjs-dist/cmaps/*.bcmap', { eager:true,query:'?url',import:'default' }), ...import.meta.glob('/node_modules/pdfjs-dist/wasm/*.wasm', { eager:true,query:'?url',import:'default' }) } as Record<string,string>;
class LocalFonts {
  async fetch({ kind, filename }: { kind:string; filename:string }) {
    const folder = ({standardFontDataUrl:"standard_fonts",cMapUrl:"cmaps",wasmUrl:"wasm"} as Record<string,string>)[kind];
    const url = folder ? assets[`/node_modules/pdfjs-dist/${folder}/${filename}`] : null;
    if (!url) throw new Error('Font PDF indisponibil.');
    const response = await fetch(url);
    if (!response.ok) throw new Error('Font PDF indisponibil.');
    return new Uint8Array(await response.arrayBuffer());
  }
}

type Source = { id: string; filename: string; sha256: string; pages: string[] };
type Rect = { left:number; top:number; width:number; height:number };

export function PdfDocument({ doc, page: requestedPage, evidence }: { doc: Source; page: number; evidence?: Evidence | null }) {
  const blob = useQuery(documentQ(doc.id));
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(requestedPage);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [rects, setRects] = useState<Rect[]>([]);
  const [highlight, setHighlight] = useState<'none'|'found'|'unlocated'>('none');
  const scroll = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null), text = useRef<HTMLDivElement>(null);
  useEffect(() => { setPage(requestedPage); }, [doc.id, requestedPage, evidence?.start, evidence?.end]);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const resize = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width)));
    resize.observe(node); return () => resize.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof getDocument> | undefined;
    setPdf(null); setError(''); setRects([]); setHighlight('none'); setLoading(true);
    if(canvas.current){canvas.current.width=0;canvas.current.height=0;}
    text.current?.replaceChildren();
    if(sheet.current)sheet.current.style.height="0px";
    if (blob.data) void blob.data.arrayBuffer().then(async data => {
      if (!active) return;
      const digest=await crypto.subtle.digest("SHA-256",data);
      const sha=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
      if(sha!==doc.sha256)throw new Error("SOURCE_VERSION_MISMATCH");
      if(!active)return;
      task = getDocument({ data: new Uint8Array(data), useWorkerFetch:false, BinaryDataFactory: LocalFonts, useSystemFonts:true });
      return task.promise;
    }).then(result => {if (active && result) setPdf(result);}).catch(e => {if(active){setError(e?.message==='SOURCE_VERSION_MISMATCH'?'Fișierul descărcat nu corespunde versiunii sursei. Reîncarcă dosarul.':'PDF-ul nu a putut fi deschis. Poți descărca originalul.');setLoading(false);}});
    return () => {active=false;void task?.destroy();};
  }, [blob.data, doc.id, doc.sha256]);
  useEffect(() => {
    if (!pdf || !width || !canvas.current || !text.current || !sheet.current) return;
    let active = true;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    let layer: TextLayer | undefined;
    const paint = async () => {
      setLoading(true);setError('');setRects([]);setHighlight('none');
      const actual = await pdf.getPage(Math.max(1, Math.min(pdf.numPages, page)));
      if (!active) return;
      const scale = Math.min(width / actual.getViewport({scale:1}).width, 1.6) * zoom;
      const viewport = actual.getViewport({scale});
      const c = canvas.current!, t = text.current!, s = sheet.current!;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.ceil(viewport.width * ratio); c.height = Math.ceil(viewport.height * ratio);
      c.style.width = `${viewport.width}px`; c.style.height = `${viewport.height}px`;
      s.style.width = `${viewport.width}px`;s.style.height = `${viewport.height}px`;
      s.style.setProperty('--total-scale-factor', String(scale));
      s.style.setProperty('--scale-round-x','1px');s.style.setProperty('--scale-round-y','1px');
      t.replaceChildren();
      render = actual.render({canvas:c,canvasContext:c.getContext('2d')!,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});
      const content = await actual.getTextContent();
      if (!active) return;
      layer = new TextLayer({container:t,textContentSource:content,viewport});
      await Promise.all([render.promise,layer.render()]);
      if (!active) return;
      setLoading(false);
      if (!evidence || evidence.page !== page) {scroll.current!.scrollTop=0;scroll.current!.scrollLeft=0;return;}
      if (evidence.document_id !== doc.id || evidence.sha256 !== doc.sha256) {setHighlight('unlocated');return;}
      const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      const nodes: {node:Text;start:number;end:number}[]=[];
      let all='', node: Node|null;
      while ((node=walker.nextNode())) {const value=node.textContent??'';nodes.push({node:node as Text,start:all.length,end:all.length+value.length});all+=value;}
      const match = locateEvidence(doc.pages[page-1]??'',all,evidence);
      if (!match) {setHighlight('unlocated');return;}
      const base=s.getBoundingClientRect(), boxes:Rect[]=[];
      for (const item of nodes) {
        const a=Math.max(item.start,match.start), b=Math.min(item.end,match.end);
        if (b<=a) continue;
        const range=document.createRange();range.setStart(item.node,a-item.start);range.setEnd(item.node,b-item.start);
        for (const box of range.getClientRects()) if(box.width>0&&box.height>0) boxes.push({left:box.left-base.left,top:box.top-base.top,width:box.width,height:box.height});
      }
      if(!boxes.length){setHighlight('unlocated');return;}
      setRects(boxes);setHighlight('found');
      scroll.current!.scrollTop=Math.max(0,boxes[0].top-scroll.current!.clientHeight*.35);
      scroll.current!.scrollLeft=Math.max(0,boxes[0].left-scroll.current!.clientWidth*.6);
    };
    void paint().catch(e=>{if(active && e?.name!=='RenderingCancelledException'){setError('Pagina nu a putut fi afișată. Reîncearcă sau descarcă originalul.');setLoading(false);}});
    return () => {active=false;render?.cancel();layer?.cancel();};
  }, [pdf,page,width,zoom,doc.id,doc.sha256,doc.pages,evidence]);
  return <div className="pdf-document">
    <div className="pdf-toolbar"><div className="flex items-center gap-1"><button aria-label="Pagina precedentă" disabled={page<=1||!pdf} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="h-4 w-4"/></button><span className="min-w-20 text-center text-sm">{page} / {pdf?.numPages ?? doc.pages.length}</span><button aria-label="Pagina următoare" disabled={!pdf||page>=pdf.numPages} onClick={()=>setPage(p=>p+1)}><ChevronRight className="h-4 w-4"/></button></div><div className="flex items-center gap-1"><button aria-label="Micșorează documentul" disabled={zoom<=.75} onClick={()=>setZoom(z=>Math.max(.75,z-.25))}><Minus className="h-4 w-4"/></button><span className="num text-sm">{Math.round(zoom*100)}%</span><button aria-label="Mărește documentul" disabled={zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.25))}><Plus className="h-4 w-4"/></button><a href={`/api/v1/documents/${encodeURIComponent(doc.id)}/download`} target="_blank" rel="noreferrer" aria-label="Descarcă documentul original"><Download className="h-4 w-4"/></a></div></div>
    {highlight==='found' && <p className="source-status"><CheckCircle2 className="h-4 w-4"/>Fragmentul exact este evidențiat în document.</p>}
    {highlight==='unlocated' && <p role="alert" className="source-status text-warning"><AlertTriangle className="h-4 w-4 shrink-0"/>Poziția exactă nu a putut fi confirmată. Verifică fragmentul și pagina; nu s-a marcat o altă valoare.</p>}
    {(error||blob.isError) && <p role="alert" className="source-status text-danger">{error||'Documentul nu a putut fi descărcat.'}</p>}
    {evidence && page !== evidence.page && <button className="mx-3 mb-2 px-2 py-1 text-sm text-agent-text" onClick={()=>setPage(evidence.page)}>Revino la fragmentul citat · p. {evidence.page}</button>}
    <div ref={scroll} className="pdf-scroll" aria-busy={loading} aria-label={`Document: ${doc.filename}`}>
      {loading && !error && !blob.isError && <p className="p-4 text-sm text-muted-foreground">Se încarcă pagina…</p>}
      <div ref={sheet} className="pdf-sheet"><canvas ref={canvas} aria-label={`Pagina ${page} din ${doc.filename}`}/><div ref={text} className="textLayer"/>{rects.map((r,i)=><div key={i} data-source-highlight="true" className="source-highlight" style={r}/>)}</div>
    </div>
  </div>;
}
