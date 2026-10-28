// Synthetic fixtures for the Lovable preview and `npm run dev:mock`. Never used against the real API.
import { ApiError } from "./errors";
import type {
  CaseDetail, CaseSummary, Doc, DocKind, Evidence, Fact, FactSet, FactsResp, Finding, Health,
  Proposal, Rejected, Run, SessionResp, TraceStep, User,
} from "./types";
import { getMockUser, MOCK_PASSWORD, setMockUser, USERS } from "./mock-auth";
import { creditCaseDetail, creditDocPages, fakeSha } from "./mock-credit";

const HDR = "DOCUMENT SINTETIC — FĂRĂ VALOARE JURIDICĂ";
const MODEL = "Qwen/Qwen2.5-32B-Instruct";

type CaseSeed = {
  id: string; title: string; created_at: string; company: string; cuiApp: string; cuiOnrc: string;
  extractDate: string; person: string; idExpiry: string | null; mandate: boolean; city: string;
};

const SEEDS: CaseSeed[] = [
  { id: "case-agrovest", title: "AgroVest Câmpia Bărăganului SRL · Extras ONRC mai vechi de 90 de zile", created_at: "2026-10-12T08:14:00Z", company: "AgroVest Câmpia Bărăganului SRL", cuiApp: "RO38451207", cuiOnrc: "RO38451207", extractDate: "2026-06-03", person: "Mihai Dumitrescu", idExpiry: "2030-04-17", mandate: false, city: "Slobozia" },
  { id: "case-codeforge", title: "Codeforge Digital SRL · Dosar complet", created_at: "2026-10-20T10:02:00Z", company: "Codeforge Digital SRL", cuiApp: "RO44120988", cuiOnrc: "RO44120988", extractDate: "2026-10-15", person: "Andreea Popescu", idExpiry: "2031-09-02", mandate: false, city: "Cluj-Napoca" },
  { id: "case-transport", title: "Transport Rapid Dunărea SRL · Lipsește actul de identitate", created_at: "2026-10-24T13:40:00Z", company: "Transport Rapid Dunărea SRL", cuiApp: "RO29877341", cuiOnrc: "RO29877341", extractDate: "2026-10-01", person: "Ion Stănescu", idExpiry: null, mandate: false, city: "Galați" },
  { id: "case-nordic", title: "Nordic Timber Solutions SRL · CUI diferit între cerere și extras", created_at: "2026-10-26T09:05:00Z", company: "Nordic Timber Solutions SRL", cuiApp: "RO41562093", cuiOnrc: "RO41562039", extractDate: "2026-10-09", person: "Elena Marinescu", idExpiry: "2029-12-11", mandate: true, city: "Suceava" },
];

function fmtRo(d: string) {
  const [y, m, dd] = d.split("-");
  return `${dd}.${m}.${y}`;
}

function buildDocs(s: CaseSeed): Doc[] {
  const slug = s.id.replace("case-", "");
  const docs: { kind: DocKind; filename: string; pages: string[] }[] = [
    {
      kind: "application", filename: `cerere_deschidere_cont_${slug}.pdf`,
      pages: [
        `${HDR}\nCERERE DE DESCHIDERE CONT — PERSOANE JURIDICE\nDenumire societate: ${s.company}\nCod unic de înregistrare (CUI): ${s.cuiApp}\nSediu social: Str. Republicii nr. 14, ${s.city}\nReprezentant legal: ${s.person}, administrator\nTip cont solicitat: cont curent în lei și euro\nScopul relației de afaceri: încasări de la clienți și plăți către furnizori.`,
        `${HDR}\nDECLARAȚII ALE SOLICITANTULUI\nSubsemnatul ${s.person} declar pe propria răspundere că informațiile furnizate sunt corecte și complete.\nData semnării: 05.10.2026\nSemnătura: ____________________`,
      ],
    },
    {
      kind: "company_extract", filename: `certificat_constatator_${slug}.pdf`,
      pages: [
        `${HDR}\nOFICIUL NAȚIONAL AL REGISTRULUI COMERȚULUI\nCERTIFICAT CONSTATATOR\nFirma: ${s.company}\nCod unic de înregistrare: ${s.cuiOnrc}\nNumăr de ordine în Registrul Comerțului: J/2019/00${slug.length}412\nData eliberării: ${fmtRo(s.extractDate)}\nStare firmă: funcțiune\nAsociat unic și administrator: ${s.person}`,
      ],
    },
  ];
  if (s.idExpiry) {
    docs.push({
      kind: "identity", filename: `carte_identitate_${slug}.pdf`,
      pages: [`${HDR}\nROMÂNIA — CARTE DE IDENTITATE\nNume și prenume: ${s.person}\nSeria XZ nr. 482193\nCNP: 2XXXXXXXXXXXX (mascat)\nDomiciliu: ${s.city}\nValabilitate: 18.04.2020 - ${fmtRo(s.idExpiry)}`],
    });
  }
  docs.push({
    kind: "ownership", filename: `declaratie_beneficiar_real_${slug}.pdf`,
    pages: [`${HDR}\nDECLARAȚIE PRIVIND BENEFICIARUL REAL\nSubsemnatul ${s.person} declar că sunt beneficiarul real al societății ${s.company}, deținând 100% din părțile sociale.\nNu sunt persoană expusă public.`],
  });
  if (s.mandate) {
    docs.push({
      kind: "mandate", filename: `imputernicire_${slug}.pdf`,
      pages: [`${HDR}\nÎMPUTERNICIRE\nSubsemnata ${s.person}, în calitate de administrator al ${s.company}, împuternicesc pe dl. Radu Ionescu să reprezinte societatea în relația cu banca.\nÎmputernicirea este valabilă până la 31.12.2027.`],
    });
  }
  return docs.map((d, i) => ({ id: `${s.id}-doc-${i + 1}`, ...d, sha256: fakeSha(`${s.id}-${d.filename}`) }));
}

function ev(doc: Doc, page: number, quote: string): Evidence {
  const text = doc.pages[page - 1] ?? "";
  const start = Math.max(0, text.indexOf(quote));
  return { document_id: doc.id, sha256: doc.sha256, page, start, end: start + quote.length, quote };
}

function extractFacts(s: CaseSeed, docs: Doc[]): { facts: Fact[]; rejected: Rejected[] } {
  const by = (k: DocKind) => docs.find((d) => d.kind === k);
  const facts: Fact[] = [];
  let n = 0;
  const add = (entity: string, field: string, value: string, doc: Doc, page: number, quote: string) =>
    facts.push({ id: `${s.id}-f${++n}`, entity_id: entity, field, value, evidence: ev(doc, page, quote) });
  const app = by("application")!;
  const onrc = by("company_extract")!;
  add("company", "company_identifier", s.cuiApp, app, 1, s.cuiApp);
  add("company", "company_identifier", s.cuiOnrc, onrc, 1, s.cuiOnrc);
  add("company", "extract_date", s.extractDate, onrc, 1, fmtRo(s.extractDate));
  add("company", "company_name", s.company, onrc, 1, s.company);
  const id = by("identity");
  if (id && s.idExpiry) add("person-1", "identity_expiry", s.idExpiry, id, 1, fmtRo(s.idExpiry));
  const own = by("ownership")!;
  add("person-1", "beneficial_owner", s.person, own, 1, s.person);
  const rejected: Rejected[] = [
    { document_id: app.id, kind: "application", field: "signature_date", value: "05.10.2026", reason: "Câmp necerut sau valoare goală" },
  ];
  if (!id) rejected.push({ document_id: own.id, kind: "ownership", field: "identity_expiry", value: "2030", reason: "Valoarea nu apare exact în document" });
  return { facts, rejected };
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function evaluate(docs: Doc[], facts: Fact[], evalDate: string): { findings: Finding[]; disposition: Exclude<Run["result"]["disposition"], null> } {
  const get = (f: string) => facts.filter((x) => x.field === f);
  const findings: Finding[] = [];
  const ex = get("extract_date")[0];
  if (!ex) findings.push({ rule_id: "BUS-05", module_id: "kyc.freshness", outcome: "UNKNOWN", severity: "medium", explanation: "Data extrasului ONRC nu a fost confirmată.", required_action: "Solicitați un certificat constatator recent.", evidence: [], entity_id: "company" });
  else {
    const d = daysBetween(ex.value, evalDate);
    findings.push(d <= 90
      ? { rule_id: "BUS-05", module_id: "kyc.freshness", outcome: "PASS", severity: "medium", explanation: `Certificatul constatator are ${d} zile (limită 90).`, required_action: "—", evidence: [ex.evidence], entity_id: "company" }
      : { rule_id: "BUS-05", module_id: "kyc.freshness", outcome: "FAIL", severity: "medium", explanation: `Certificatul constatator are ${d} zile, peste limita de 90 de zile.`, required_action: "Solicitați clientului un certificat constatator emis în ultimele 90 de zile.", evidence: [ex.evidence], entity_id: "company" });
  }
  const cuis = get("company_identifier");
  if (cuis.length < 2) findings.push({ rule_id: "CON-02", module_id: "kyc.consistency", outcome: "UNKNOWN", severity: "high", explanation: "CUI-ul nu este disponibil în ambele documente.", required_action: "Confirmați CUI-ul din cerere și din extras.", evidence: cuis.map((c) => c.evidence), entity_id: "company" });
  else {
    const same = new Set(cuis.map((c) => c.value)).size === 1;
    findings.push(same
      ? { rule_id: "CON-02", module_id: "kyc.consistency", outcome: "PASS", severity: "high", explanation: "CUI-ul din cerere corespunde celui din certificatul constatator.", required_action: "—", evidence: cuis.map((c) => c.evidence), entity_id: "company" }
      : { rule_id: "CON-02", module_id: "kyc.consistency", outcome: "FAIL", severity: "high", explanation: `CUI diferit: ${cuis.map((c) => c.value).join(" ≠ ")}.`, required_action: "Escaladați către conformitate; verificați identitatea societății.", evidence: cuis.map((c) => c.evidence), entity_id: "company" });
  }
  const idf = get("identity_expiry")[0];
  if (!idf) findings.push({ rule_id: "VAL-01", module_id: "kyc.validity", outcome: "UNKNOWN", severity: "high", explanation: "Nu există act de identitate valabil pentru reprezentantul legal.", required_action: "Solicitați copia actului de identitate al administratorului.", evidence: [], entity_id: "person-1" });
  else findings.push(idf.value > evalDate
    ? { rule_id: "VAL-01", module_id: "kyc.validity", outcome: "PASS", severity: "high", explanation: "Actul de identitate este valabil la data evaluării.", required_action: "—", evidence: [idf.evidence], entity_id: "person-1" }
    : { rule_id: "VAL-01", module_id: "kyc.validity", outcome: "FAIL", severity: "high", explanation: "Actul de identitate este expirat.", required_action: "Solicitați un act de identitate valabil.", evidence: [idf.evidence], entity_id: "person-1" });
  const mandate = docs.find((d) => d.kind === "mandate");
  findings.push(mandate
    ? { rule_id: "BUS-01", module_id: "kyc.mandate", outcome: "PASS", severity: "low", explanation: "Împuternicirea este prezentă la dosar.", required_action: "—", evidence: [ev(mandate, 1, "Radu Ionescu")], entity_id: null }
    : { rule_id: "BUS-01", module_id: "kyc.mandate", outcome: "NOT_APPLICABLE", severity: "low", explanation: "Nu există împuternicit; regula nu se aplică.", required_action: "—", evidence: [], entity_id: null });
  const disposition = findings.some((f) => f.outcome === "FAIL")
    ? "ESCALATED"
    : findings.some((f) => f.outcome === "UNKNOWN") ? "NEEDS_INFORMATION" : "READY_FOR_REVIEW";
  return { findings, disposition };
}

type CaseState = {
  detail: CaseDetail; seed: CaseSeed; proposal: Proposal | null;
  facts: { revision: number; facts: FactSet } | null; runs: (Run & { trace: TraceStep[] })[];
};

let STATE: Map<string, CaseState> | null = null;
let counter = 0;
const nextId = (p: string) => `${p}-${(++counter).toString().padStart(4, "0")}`;

function makeProposal(st: CaseState, created_at: string): Proposal {
  const { facts, rejected } = extractFacts(st.seed, st.detail.documents);
  const calls = st.detail.documents.map((d, i) => ({ document_id: d.id, kind: d.kind, latency_ms: 1400 + ((i * 731 + d.id.length * 97) % 2200) }));
  return {
    id: nextId("prop"), case_revision: st.detail.revision, is_current: true, status: "COMPLETED",
    provider: "featherless", model: MODEL, mode: "cloud", label: `Cloud demo · featherless · ${MODEL} · date sintetice`,
    prompt_version: "extract.v1", latency_ms: calls.reduce((a, c) => a + c.latency_ms, 0),
    facts: { schema_version: "FactSet.v1", extraction_mode: "ai_assisted", facts }, rejected, calls, error: null, created_at,
  };
}

function makeRun(st: CaseState, evalDate: string, created_at: string): Run & { trace: TraceStep[] } {
  const { findings, disposition } = evaluate(st.detail.documents, st.facts?.facts.facts ?? [], evalDate);
  const mods = Array.from(new Set(findings.map((f) => f.module_id)));
  return {
    id: nextId("run"), case_id: st.detail.id, case_revision: st.detail.revision, status: "COMPLETED",
    snapshot: { evaluation_date: evalDate, workflow: { id: "ro.sme.foundation", version: "0.1.0" } },
    result: { status: "COMPLETED", disposition, scope: "Foundation: VAL-01, CON-02, BUS-05 only. Not a complete KYC review.", processing_mode: "ai_assisted", findings },
    created_at,
    trace: mods.map((m, i) => ({ step_id: m.replace("kyc.", ""), module: { id: m, version: "0.1.0", rule_ids: findings.filter((f) => f.module_id === m).map((f) => f.rule_id) }, status: "SUCCEEDED", duration_ms: 0.05 + i * 0.02 })),
  };
}

function state(): Map<string, CaseState> {
  if (STATE) return STATE;
  STATE = new Map();
  for (const s of SEEDS) {
    const st: CaseState = { seed: s, detail: { id: s.id, title: s.title, revision: 1, owner_id: "u-analyst", created_at: s.created_at, documents: buildDocs(s) }, proposal: null, facts: null, runs: [] };
    const t = (h: number) => new Date(Date.parse(s.created_at) + h * 3600000).toISOString();
    st.proposal = makeProposal(st, t(1));
    if (s.id !== "case-transport") {
      st.detail.revision = 2;
      st.facts = { revision: 2, facts: st.proposal.facts };
      if (s.id === "case-nordic") {
        // older stale run on revision 2, then revision bumped by re-confirmation
        st.runs.unshift(makeRun(st, t(2).slice(0, 10), t(2)));
        st.detail.revision = 3;
        st.facts = { revision: 3, facts: st.proposal.facts };
      }
      st.runs.unshift(makeRun(st, "2026-10-27", t(3)));
    }
    STATE.set(s.id, st);
  }
  return STATE;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
function need(): User {
  const u = getMockUser();
  if (!u) throw new ApiError(401, "Neautentificat");
  return u;
}
function mut() {
  if (need().role === "supervisor") throw new ApiError(403, "Rolul de supervizor nu poate modifica dovezile");
}
function cs(id: string) {
  const st = state().get(id);
  if (!st) throw new ApiError(404, "Dosar inexistent");
  return st;
}
const withCurrent = (st: CaseState, r: Run): Run => {
  const { trace: _t, ...rest } = r as Run & { trace?: TraceStep[] };
  return { ...rest, is_current: r.case_revision === st.detail.revision };
};

function findRun(runId: string) {
  for (const st of state().values()) {
    const r = st.runs.find((x) => x.id === runId);
    if (r) return r;
  }
  throw new ApiError(404, "Rulare inexistentă");
}

export const mockApi = {
  getSession: async (): Promise<SessionResp> => {
    await delay(120);
    return { user: need(), csrf_token: "mock-csrf" };
  },
  login: async (username: string, password: string): Promise<SessionResp> => {
    await delay(300);
    const u = USERS[username.trim().toLowerCase()];
    if (!u || password !== MOCK_PASSWORD) throw new ApiError(401, "Utilizator sau parolă incorectă");
    setMockUser(u);
    return { user: u, csrf_token: "mock-csrf" };
  },
  logout: async () => {
    setMockUser(null);
  },
  listCases: async (): Promise<CaseSummary[]> => {
    need(); await delay(150);
    return [...state().values()].map(({ detail: { documents: _d, ...s } }) => s);
  },
  getCase: async (id: string): Promise<CaseDetail> => {
    need(); await delay(120);
    const credit = creditCaseDetail(id);
    if (credit) return credit;
    return structuredClone(cs(id).detail);
  },
  documentBlob: async (_id: string): Promise<Blob> => new Blob([], { type: "application/pdf" }),
  runExtraction: async (caseId: string): Promise<Proposal> => {
    mut();
    const st = cs(caseId);
    await delay(4500);
    st.proposal = makeProposal(st, new Date().toISOString());
    return structuredClone(st.proposal);
  },
  latestExtraction: async (caseId: string): Promise<Proposal> => {
    need(); await delay(100);
    const st = cs(caseId);
    if (!st.proposal) throw new ApiError(404, "Nicio extragere");
    return { ...structuredClone(st.proposal), is_current: st.proposal.case_revision === st.detail.revision };
  },
  confirmFacts: async (caseId: string, expected_revision: number, facts: FactSet) => {
    mut(); await delay(400);
    const st = cs(caseId);
    if (expected_revision !== st.detail.revision) throw new ApiError(409, "Revision conflict");
    st.detail.revision += 1;
    st.facts = { revision: st.detail.revision, facts: structuredClone(facts) };
    if (st.proposal) st.proposal.case_revision = st.detail.revision;
    return { revision: st.detail.revision };
  },
  getFacts: async (caseId: string): Promise<FactsResp> => {
    need(); await delay(100);
    const st = cs(caseId);
    if (!st.facts) throw new ApiError(404, "Nicio dovadă confirmată");
    return { revision: st.facts.revision, is_current: st.facts.revision === st.detail.revision, facts: structuredClone(st.facts.facts) };
  },
  createRun: async (caseId: string, expected_revision: number, evaluation_date: string): Promise<Run> => {
    mut(); await delay(900);
    const st = cs(caseId);
    if (expected_revision !== st.detail.revision) throw new ApiError(409, "Revision conflict");
    if (!st.facts) throw new ApiError(422, "Nu există fapte confirmate");
    const r = makeRun(st, evaluation_date, new Date().toISOString());
    st.runs.unshift(r);
    return withCurrent(st, r);
  },
  listRuns: async (caseId: string): Promise<Run[]> => {
    need(); await delay(150);
    const st = cs(caseId);
    return st.runs.map((r) => withCurrent(st, structuredClone(r)));
  },
  getFindings: async (runId: string): Promise<Finding[]> => {
    need(); await delay(80);
    return structuredClone(findRun(runId).result.findings);
  },
  getTrace: async (runId: string): Promise<TraceStep[]> => {
    need(); await delay(80);
    return structuredClone(findRun(runId).trace);
  },
  health: async (): Promise<Health> => ({ ai_enabled: true, ai: { provider: "featherless", model: MODEL, mode: "cloud" } }),
};

/** Mock-only: page texts for the placeholder PDF viewer. */
export function mockDocPages(docId: string): string[] {
  const credit = creditDocPages(docId);
  if (credit) return credit;
  for (const st of state().values()) {
    const d = st.detail.documents.find((x) => x.id === docId);
    if (d) return d.pages;
  }
  return [];
}
