import React, { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  FolderOpen,
  Layers3,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Workflow,
  X,
  AlertCircle,
  Play,
  Menu,
} from "lucide-react";
import {
  api,
  post,
  setCsrf,
  type Case,
  type Doc,
  type Fact,
  type Finding,
  type Module,
  type Run,
  type User,
} from "./api";
import { createSample, samples } from "./demo";
import { Badge, Logo, Stat } from "./components";
import { labels, ruleNames } from "./labels";
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [cases, setCases] = useState<Case[]>([]),
    [runs, setRuns] = useState<Record<string, Run[]>>({}),
    [modules, setModules] = useState<Module[]>([]);
  const [page, setPage] = useState("cases"),
    [selected, setSelected] = useState<Case | null>(null),
    [currentRuns, setCurrentRuns] = useState<Run[]>([]),
    [facts, setFacts] = useState<Fact[]>([]),
    [factsCurrent, setFactsCurrent] = useState(false);
  const [tab, setTab] = useState("findings"),
    [evidence, setEvidence] = useState<Finding | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState(false),
    [mobile, setMobile] = useState(false);
  const [sample, setSample] = useState(0),
    [title, setTitle] = useState(""),
    [evalDate, setEvalDate] = useState("2026-10-28"),
    [fileKind, setFileKind] = useState("application");
  const [factDoc, setFactDoc] = useState(""),
    [factField, setFactField] = useState("company_identifier"),
    [factValue, setFactValue] = useState(""),
    [factEntity, setFactEntity] = useState("company"),
    [factPage, setFactPage] = useState(1);
  const [username, setUsername] = useState("manager"),
    [password, setPassword] = useState("");
  async function load() {
    const items = await api<Case[]>("/cases");
    setCases(items);
    const entries = await Promise.all(
      items.map(
        async (c) => [c.id, await api<Run[]>(`/cases/${c.id}/runs`)] as const,
      ),
    );
    setRuns(Object.fromEntries(entries));
    setModules(await api<Module[]>("/modules"));
  }
  async function openCase(id: string) {
    const [c, r, f] = await Promise.all([
      api<Case>(`/cases/${id}`),
      api<Run[]>(`/cases/${id}/runs`),
      api<{ facts: { facts: Fact[] } | null; is_current: boolean }>(
        `/cases/${id}/facts`,
      ),
    ]);
    setSelected(c);
    setCurrentRuns(r);
    setFacts(f.facts?.facts || []);
    setFactsCurrent(f.is_current);
    setFactDoc(c.documents?.[0]?.id || "");
    setEvidence(null);
    setPage("cases");
    setMobile(false);
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare neașteptată.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api<{ user: User; csrf_token: string }>("/session")
      .then((s) => {
        setCsrf(s.csrf_token);
        setUser(s.user);
        return load();
      })
      .catch((e) => {
        if (!String(e).includes("401")) setError(String(e));
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
        ) || [],
      );
    focusables()[0]?.focus();
    function keyboard(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        setModal(false);
        return;
      }
      if (e.key !== "Tab") return;
      const elements = focusables(),
        first = elements[0],
        last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [modal, busy]);
  const latest = currentRuns[0],
    active = latest?.is_current ? latest : undefined;
  const attention = cases.filter(
    (c) =>
      runs[c.id]?.[0]?.is_current &&
      runs[c.id]?.[0]?.result.disposition === "ESCALATED",
  ).length;
  const ready = cases.filter(
    (c) =>
      runs[c.id]?.[0]?.is_current &&
      runs[c.id]?.[0]?.result.disposition === "READY_FOR_REVIEW",
  ).length;
  const pending = cases.length - ready - attention;
  function go(target: string) {
    setPage(target);
    setSelected(null);
    setEvidence(null);
    setMobile(false);
  }
  async function addFact() {
    if (!selected) return;
    const doc = selected.documents?.find((d) => d.id === factDoc);
    const text = doc?.pages[factPage - 1];
    if (!doc || !text)
      throw new Error("Selectează un document și o pagină validă.");
    const start = text.indexOf(factValue);
    if (!factValue || start < 0)
      throw new Error("Valoarea trebuie să apară exact în pagina sursă.");
    const next = [
      ...facts,
      {
        id: crypto.randomUUID(),
        entity_id: factEntity,
        field: factField,
        value: factValue,
        evidence: {
          document_id: doc.id,
          sha256: doc.sha256,
          page: factPage,
          start,
          end: start + factValue.length,
          quote: factValue,
        },
      },
    ];
    await post(`/cases/${selected.id}/facts`, {
      expected_revision: selected.revision,
      facts: { facts: next },
    });
    await openCase(selected.id);
    setFactValue("");
    await load();
  }
  if (loading)
    return (
      <div className="loading">
        <Loader2 className="spin" /> Se încarcă spațiul de lucru…
      </div>
    );
  if (!user)
    return (
      <div className="login">
        <section className="login-story">
          <Logo />
          <div>
            <div className="eyebrow">
              MAI PUȚINĂ RUTINĂ. MAI MULTĂ CLARITATE.
            </div>
            <h1>
              Documente.
              <br />
              Decizii.
              <br />
              <em>În același loc.</em>
            </h1>
            <p>
              Un spațiu de lucru pentru dosare IMM, verificări trasabile și
              echipe care merg mai departe.
            </p>
          </div>
          <span className="login-foot">
            <ShieldCheck size={17} /> Mediu demonstrativ · Date sintetice
          </span>
        </section>
        <section className="login-form">
          <div className="eyebrow">BINE AI REVENIT</div>
          <h2>Intră în spațiul tău.</h2>
          <p className="muted">
            Folosește contul demonstrativ configurat local.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const s = await post<{ user: User; csrf_token: string }>(
                  "/session",
                  { username, password },
                );
                setCsrf(s.csrf_token);
                setUser(s.user);
                setPassword("");
                await load();
              });
            }}
          >
            <label>
              Utilizator
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label>
              Parolă
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <>
                  Continuă <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <small>Verificări deterministe active. Integrarea AI urmează.</small>
        </section>
      </div>
    );
  return (
    <div className="shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Logo />
        <div className="workspace-switch">
          <span className="workspace-avatar">R</span>
          <div>
            Romania workspace<small>Operațiuni · IMM</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <div className="nav-label">SPAȚIU DE LUCRU</div>
        <nav>
          <button
            className={page === "cases" ? "active" : ""}
            onClick={() => go("cases")}
          >
            <LayoutDashboard size={18} />
            Dosare<span className="nav-count">{cases.length}</span>
          </button>
          <button
            className={page === "modules" ? "active" : ""}
            onClick={() => go("modules")}
          >
            <Layers3 size={18} />
            Module & fluxuri
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-card">
            <span className="live-dot" />
            Mediu demonstrativ
            <p>
              Date sintetice. Rezultate reale pentru cele 3 verificări active.
            </p>
            <span className="mode-tag">AI NEACTIVAT</span>
          </div>
          <button
            className="profile"
            onClick={() =>
              void act(async () => {
                await api("/session", { method: "DELETE" });
                setUser(null);
                setSelected(null);
              })
            }
          >
            <span className="avatar">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            <span>
              {user.username}
              <small>{labels[user.role]}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Deschide meniul"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span className="muted">Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {selected
                ? "Revizuire dosar"
                : page === "modules"
                  ? "Module & fluxuri"
                  : "Dosare IMM"}
            </strong>
          </div>
          <div className="header-right">
            <span className="env">
              <span />
              DEMO
            </span>
            <span className="top-divider" />
            <ShieldCheck size={17} />
            <span className="desktop-only">Acces pe roluri</span>
          </div>
        </header>
        <main>
          <div className="demo-notice">
            <Sparkles size={15} />
            <span>
              Foundation preview · Observații introduse manual, 3 verificări
              active. Nu reprezintă o evaluare KYC completă.
            </span>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Închide eroarea"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!selected && page === "cases" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">OPERAȚIUNI, CU CLARITATE</div>
                  <h1>
                    Spațiul tău de lucru<span className="yellow-dot">.</span>
                  </h1>
                  <p>
                    Toate dosarele, documentele și verificările. O singură
                    perspectivă.
                  </p>
                </div>
                {user.role !== "supervisor" && (
                  <button className="primary" onClick={() => setModal(true)}>
                    <Plus size={18} />
                    Dosar nou
                  </button>
                )}
              </div>
              <div className="stats">
                <Stat
                  label="Dosare în lucru"
                  value={cases.length}
                  sub="În aria ta de acces"
                  icon={<FolderOpen />}
                />
                <Stat
                  label="Necesită atenție"
                  value={attention}
                  sub="Discrepanțe identificate"
                  icon={<AlertCircle />}
                  accent="attention"
                />
                <Stat
                  label="Pregătite pentru revizuire"
                  value={ready}
                  sub="Cele 3 verificări au trecut"
                  icon={<CheckCheck />}
                />
                <Stat
                  label="De completat"
                  value={pending}
                  sub="Fără rezultat curent sau cu date lipsă"
                  icon={<Clock3 />}
                />
              </div>
              <div className="work-grid">
                <section className="panel queue">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Dosarele tale{" "}
                        <span className="count">{cases.length}</span>
                      </h2>
                      <p>De la document la următorul pas.</p>
                    </div>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void act(load)}
                    >
                      Actualizează
                    </button>
                  </div>
                  <div className="table-controls">
                    <div className="pills">
                      {[
                        ["all", "Toate"],
                        ["attention", "De verificat"],
                        ["ready", "Pregătite"],
                      ].map(([v, l]) => (
                        <button
                          key={v}
                          className={filter === v ? "selected" : ""}
                          onClick={() => setFilter(v)}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <label className="search">
                      <Search size={16} />
                      <input
                        aria-label="Caută dosar"
                        placeholder="Caută un dosar…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="case-table">
                    <div className="table-labels">
                      <span>COMPANIE / DOSAR</span>
                      <span>STARE</span>
                      <span>ACTUALIZARE</span>
                      <span />
                    </div>
                    {cases
                      .filter(
                        (c) =>
                          c.title
                            .toLowerCase()
                            .includes(search.toLowerCase()) &&
                          (filter === "all" ||
                            (filter === "attention"
                              ? runs[c.id]?.[0]?.is_current &&
                                runs[c.id]?.[0]?.result.disposition ===
                                  "ESCALATED"
                              : runs[c.id]?.[0]?.is_current &&
                                runs[c.id]?.[0]?.result.disposition ===
                                  "READY_FOR_REVIEW")),
                      )
                      .map((c, i) => {
                        const r = runs[c.id]?.[0];
                        return (
                          <button
                            className="case-row"
                            key={c.id}
                            onClick={() => void act(() => openCase(c.id))}
                          >
                            <span className="company-cell">
                              <span className={`company-icon tone-${i % 3}`}>
                                {c.title
                                  .split(" ")
                                  .slice(0, 2)
                                  .map((w) => w[0])
                                  .join("")}
                              </span>
                              <span>
                                <strong>{c.title}</strong>
                                <small>
                                  IMM · #{c.id.slice(0, 8).toUpperCase()}
                                </small>
                              </span>
                            </span>
                            <span>
                              {r?.is_current ? (
                                <Badge
                                  value={r.result.disposition || r.status}
                                />
                              ) : (
                                <span className="draft">
                                  <span />
                                  În pregătire
                                </span>
                              )}
                            </span>
                            <span className="row-date">
                              {new Date(c.created_at).toLocaleDateString(
                                "ro-RO",
                                { day: "2-digit", month: "short" },
                              )}
                              <small>Revizia {c.revision}</small>
                            </span>
                            <ArrowUpRight size={17} />
                          </button>
                        );
                      })}
                    {!cases.length && (
                      <div className="empty">
                        <FolderOpen size={32} />
                        <h3>Primul dosar începe aici.</h3>
                        <p>
                          Creează un dosar sau explorează un scenariu sintetic.
                        </p>
                        {user.role !== "supervisor" && (
                          <button
                            className="secondary"
                            onClick={() => setModal(true)}
                          >
                            Adaugă un dosar <Plus size={15} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="table-foot">
                    <span>
                      {cases.length} dosare accesibile · maximum 100 în această
                      vedere
                    </span>
                    <ShieldCheck size={15} />
                  </div>
                </section>
                <aside className="insights">
                  <section className="focus-card">
                    <div className="focus-icon">
                      <Workflow size={23} />
                    </div>
                    <div className="eyebrow">UN FLUX. MAI MULTĂ CLARITATE.</div>
                    <h2>
                      Din documente,
                      <br />
                      în pași concreți.
                    </h2>
                    <p>
                      Fiecare discrepanță duce la sursa ei. Verifică, înțelege
                      și decide următorul pas.
                    </p>
                    <button onClick={() => go("modules")}>
                      Explorează verificările <ArrowRight size={17} />
                    </button>
                    <div className="abstract-lines">
                      <span />
                      <span />
                      <span />
                    </div>
                  </section>
                  <section className="panel checklist">
                    <h3>Ce verificăm acum</h3>
                    {[
                      "Valabilitatea actului",
                      "Consistența identificatorilor",
                      "Actualitatea extrasului",
                    ].map((t) => (
                      <div key={t}>
                        <Check size={15} />
                        {t}
                      </div>
                    ))}
                    <p>
                      Politică demonstrativă, versionată.
                      <br />
                      Decizia finală rămâne la echipa ta.
                    </p>
                  </section>
                </aside>
              </div>
            </>
          )}
          {page === "modules" && !selected && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CONSTRUIT PENTRU EXTINDERE</div>
                  <h1>
                    Un flux. Module independente
                    <span className="yellow-dot">.</span>
                  </h1>
                  <p>
                    Verificări cu intrări clare, rezultate comune și dovezi
                    verificabile.
                  </p>
                </div>
              </div>
              <div className="workflow-banner">
                <div className="workflow-symbol">
                  <Workflow size={28} />
                </div>
                <div>
                  <h2>Revizuire IMM · Foundation</h2>
                  <p>ro.sme.foundation / v0.1.0 · Politică demonstrativă</p>
                </div>
                <span className="badge green">
                  <span />3 module active
                </span>
              </div>
              <div className="module-grid">
                {modules.map((m, i) => (
                  <section className="panel module-card" key={m.id}>
                    <span className="module-number">0{i + 1}</span>
                    <FileCheck2 size={27} />
                    <h2>{ruleNames[m.rule_ids[0]]}</h2>
                    <p>{m.id}</p>
                    <div>
                      <span>INTRARE</span>
                      <code>{m.input_schema}</code>
                      <ArrowRight size={14} />
                      <span>REZULTAT</span>
                      <code>{m.output_schema}</code>
                    </div>
                    <footer>
                      <span>Versiunea {m.version}</span>
                      <Badge value="PASS" />
                    </footer>
                  </section>
                ))}
              </div>
              <section className="panel roadmap">
                <Layers3 size={22} />
                <div>
                  <h3>Următoarele module</h3>
                  <p>
                    Extragere AI · Investigarea discrepanțelor · Structura de
                    proprietate · Referințe externe
                  </p>
                </div>
                <span className="muted">În dezvoltare</span>
              </section>
            </>
          )}
          {selected && (
            <>
              <button
                className="back text-button"
                onClick={() => {
                  setSelected(null);
                  setEvidence(null);
                  void act(load);
                }}
              >
                <ArrowLeft size={15} />
                Înapoi la dosare
              </button>
              <div className="page-heading case-heading">
                <div>
                  <div className="eyebrow">
                    DOSAR IMM / #{selected.id.slice(0, 8).toUpperCase()}
                  </div>
                  <h1>{selected.title}</h1>
                  <p>
                    {selected.documents?.length || 0} documente · Revizia{" "}
                    {selected.revision} ·{" "}
                    {active ? (
                      <Badge
                        value={active.result.disposition || active.status}
                      />
                    ) : (
                      <span>În pregătire</span>
                    )}
                  </p>
                </div>
                <div className="run-actions">
                  <label>
                    Data evaluării
                    <input
                      type="date"
                      value={evalDate}
                      onChange={(e) => setEvalDate(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !factsCurrent || !evalDate}
                    onClick={() =>
                      void act(async () => {
                        await post(
                          `/cases/${selected.id}/runs`,
                          {
                            expected_revision: selected.revision,
                            evaluation_date: evalDate,
                          },
                          { "Idempotency-Key": crypto.randomUUID() },
                        );
                        await openCase(selected.id);
                        await load();
                      })
                    }
                  >
                    {busy ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Play size={16} />
                    )}
                    Rulează verificările
                  </button>
                </div>
              </div>
              {!factsCurrent && (
                <div className="notice">
                  <AlertCircle size={17} />
                  Adaugă sau confirmă observațiile pentru revizia curentă
                  înainte de a rula verificările.
                </div>
              )}
              <div className="detail-tabs">
                {[
                  ["findings", "Rezultate"],
                  ["documents", "Documente & observații"],
                  ["activity", "Activitate"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={tab === id ? "active" : ""}
                    onClick={() => {
                      setTab(id);
                      setEvidence(null);
                    }}
                  >
                    {label}
                    {id === "findings" && latest && (
                      <span>{latest.result.findings.length}</span>
                    )}
                  </button>
                ))}
              </div>
              {tab === "findings" && (
                <div
                  className={`results-grid ${evidence ? "with-evidence" : ""}`}
                >
                  <section className="panel findings">
                    <div className="panel-heading">
                      <div>
                        <h2>Rezultatele verificărilor</h2>
                        <p>
                          {latest
                            ? `Evaluare la ${latest.snapshot.evaluation_date} · Observații manuale, verificări deterministe`
                            : "Rezultatele apar după prima rulare."}
                        </p>
                      </div>
                      {latest && (
                        <button
                          className="icon-button"
                          title="Descarcă raport JSON"
                          aria-label="Descarcă raport JSON"
                          onClick={() => {
                            const url = URL.createObjectURL(
                              new Blob([JSON.stringify(latest, null, 2)], {
                                type: "application/json",
                              }),
                            );
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `casecheck-${selected.id}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          <ArrowDownToLine size={18} />
                        </button>
                      )}
                    </div>
                    {latest && !latest.is_current && (
                      <div className="notice">
                        Rezultat istoric. Documentele sau observațiile s-au
                        schimbat; rulează din nou.
                      </div>
                    )}
                    {latest?.result.findings.map((f, i) => (
                      <button
                        key={i}
                        className={`finding ${evidence === f ? "selected" : ""}`}
                        onClick={() => setEvidence(f)}
                      >
                        <span
                          className={`finding-icon ${f.outcome === "PASS" ? "ok" : "warn"}`}
                        >
                          {f.outcome === "PASS" ? (
                            <Check size={18} />
                          ) : (
                            <AlertCircle size={18} />
                          )}
                        </span>
                        <span className="finding-body">
                          <span className="rule-code">{f.rule_id}</span>
                          <strong>{ruleNames[f.rule_id] || f.rule_id}</strong>
                          <span>{f.explanation}</span>
                          <small>
                            <FileText size={12} />
                            {f.evidence.length} surse de verificat
                          </small>
                        </span>
                        <Badge value={f.outcome} />
                        <ChevronRight size={17} />
                      </button>
                    ))}
                    {!latest && (
                      <div className="empty">
                        <FileCheck2 size={35} />
                        <h3>Dovezi înainte de concluzii.</h3>
                        <p>
                          Încarcă documentele și confirmă observațiile pentru a
                          începe.
                        </p>
                        <button
                          className="secondary"
                          onClick={() => setTab("documents")}
                        >
                          Vezi documentele <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                    <div className="findings-foot">
                      <ShieldCheck size={16} /> Rezultatele acoperă cele 3
                      module active. Nu constituie aprobare KYC.
                    </div>
                  </section>
                  {evidence && (
                    <aside className="panel evidence-panel">
                      <div className="panel-heading">
                        <div>
                          <div className="eyebrow">URMĂREȘTE SURSA</div>
                          <h2>Dovezi & context</h2>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Închide dovezile"
                          onClick={() => setEvidence(null)}
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <div className="evidence-content">
                        <Badge value={evidence.outcome} />
                        <h3>{ruleNames[evidence.rule_id]}</h3>
                        <p>{evidence.required_action}</p>
                        {!evidence.evidence.length && (
                          <div className="notice">
                            Nu există încă dovezi pentru această verificare.
                          </div>
                        )}
                        {evidence.evidence.map((e, i) => {
                          const doc = selected.documents?.find(
                              (d) => d.id === e.document_id,
                            ),
                            text = doc?.pages[e.page - 1];
                          return (
                            <div className="source-card" key={i}>
                              <div>
                                <FileText size={16} />
                                <strong>
                                  {doc ? labels[doc.kind] : e.document_id}
                                </strong>
                                <span>p. {e.page}</span>
                              </div>
                              <pre>
                                {text ? (
                                  <>
                                    {text.slice(0, e.start)}
                                    <mark>{text.slice(e.start, e.end)}</mark>
                                    {text.slice(e.end)}
                                  </>
                                ) : (
                                  e.quote
                                )}
                              </pre>
                              <a
                                href={`/api/v1/documents/${e.document_id}/download`}
                              >
                                <ArrowDownToLine size={13} />
                                Descarcă sursa
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </aside>
                  )}
                </div>
              )}
              {tab === "documents" && (
                <div className="documents-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Documentele dosarului</h2>
                        <p>
                          PDF cu text sau pagini JSON sintetice · maximum 2 MB
                        </p>
                      </div>
                      <Upload size={20} />
                    </div>
                    {selected.documents?.map((d) => (
                      <div className="document-row" key={d.id}>
                        <span className="document-icon">
                          <FileText size={21} />
                        </span>
                        <div>
                          <strong>{labels[d.kind]}</strong>
                          <small>
                            {d.filename} · {d.pages.length} pagini
                          </small>
                        </div>
                        <a
                          className="icon-button"
                          aria-label={`Descarcă ${d.filename}`}
                          href={`/api/v1/documents/${d.id}/download`}
                        >
                          <ArrowDownToLine size={17} />
                        </a>
                      </div>
                    ))}
                    {user.role !== "supervisor" && (
                      <div className="upload-zone">
                        <Upload size={25} />
                        <h3>Adaugă un document</h3>
                        <select
                          aria-label="Tip document"
                          value={fileKind}
                          onChange={(e) => setFileKind(e.target.value)}
                        >
                          {[
                            "application",
                            "company_extract",
                            "identity",
                            "ownership",
                            "declaration",
                            "mandate",
                          ].map((k) => (
                            <option value={k} key={k}>
                              {labels[k]}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Încarcă document"
                          type="file"
                          accept="application/pdf,application/json"
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void act(async () => {
                              const form = new FormData();
                              form.set("file", file);
                              form.set("kind", fileKind);
                              form.set(
                                "expected_revision",
                                String(selected.revision),
                              );
                              await api(`/cases/${selected.id}/documents`, {
                                method: "POST",
                                body: form,
                              });
                              await openCase(selected.id);
                              await load();
                            });
                            e.target.value = "";
                          }}
                        />
                        <small>
                          Documentele noi invalidează eligibilitatea
                          rezultatului anterior.
                        </small>
                      </div>
                    )}
                  </section>
                  <section className="panel observations">
                    <div className="panel-heading">
                      <div>
                        <h2>Observații confirmate</h2>
                        <p>Introducere manuală în această versiune</p>
                      </div>
                      <span className="count">{facts.length}</span>
                    </div>
                    <div className="facts-list">
                      {facts.map((f) => (
                        <div key={f.id}>
                          <span>
                            <strong>{f.field}</strong>
                            <small>{f.entity_id}</small>
                          </span>
                          <code>{f.value}</code>
                        </div>
                      ))}
                    </div>
                    {user.role !== "supervisor" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(addFact);
                        }}
                      >
                        <label>
                          Document sursă
                          <select
                            value={factDoc}
                            onChange={(e) => setFactDoc(e.target.value)}
                            required
                          >
                            <option value="">Selectează documentul</option>
                            {selected.documents?.map((d) => (
                              <option value={d.id} key={d.id}>
                                {labels[d.kind]} · {d.filename}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="form-row">
                          <label>
                            Câmp
                            <select
                              value={factField}
                              onChange={(e) => setFactField(e.target.value)}
                            >
                              <option value="company_identifier">
                                Identificator companie
                              </option>
                              <option value="identity_expiry">
                                Expirare act
                              </option>
                              <option value="extract_date">
                                Data extrasului
                              </option>
                            </select>
                          </label>
                          <label>
                            Entitate
                            <input
                              value={factEntity}
                              onChange={(e) => setFactEntity(e.target.value)}
                              required
                            />
                          </label>
                        </div>
                        <div className="form-row">
                          <label>
                            Valoare exactă din document
                            <input
                              value={factValue}
                              onChange={(e) => setFactValue(e.target.value)}
                              required
                              placeholder="Ex. 2026-09-01"
                            />
                          </label>
                          <label>
                            Pagină
                            <input
                              type="number"
                              min="1"
                              max="30"
                              value={factPage}
                              onChange={(e) =>
                                setFactPage(Number(e.target.value))
                              }
                            />
                          </label>
                        </div>
                        <button
                          className="secondary full"
                          disabled={busy || !factDoc}
                        >
                          <Plus size={16} />
                          Adaugă observația
                        </button>
                        {facts.length > 0 && !factsCurrent && (
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await post(`/cases/${selected.id}/facts`, {
                                  expected_revision: selected.revision,
                                  facts: { facts },
                                });
                                await openCase(selected.id);
                                await load();
                              })
                            }
                          >
                            Reconfirmă observațiile existente
                          </button>
                        )}
                      </form>
                    )}
                  </section>
                </div>
              )}
              {tab === "activity" && (
                <section className="panel activity">
                  <div className="panel-heading">
                    <div>
                      <h2>Istoricul rulărilor</h2>
                      <p>
                        Pași executați efectiv, versiuni și durate măsurate.
                      </p>
                    </div>
                    <Workflow size={22} />
                  </div>
                  {currentRuns.length === 0 && (
                    <div className="empty">Nicio rulare încă.</div>
                  )}
                  {currentRuns.map((r, i) => (
                    <div className="run-block" key={r.id}>
                      <div className="run-block-title">
                        <strong>
                          Rulare #{currentRuns.length - i}{" "}
                          <span>· Revizia {r.case_revision}</span>
                        </strong>
                        <Badge value={r.result.disposition || r.status} />
                        <small>{r.is_current ? "Curentă" : "Istorică"}</small>
                      </div>
                      {r.result.trace.map((t) => (
                        <div className="trace-step" key={t.step_id}>
                          <span
                            className={
                              t.status === "SUCCEEDED"
                                ? "trace-dot"
                                : "trace-dot failed"
                            }
                          >
                            {t.status === "SUCCEEDED" ? (
                              <Check size={12} />
                            ) : (
                              <X size={12} />
                            )}
                          </span>
                          <strong>{t.module.id}</strong>
                          <code>v{t.module.version}</code>
                          <span>{t.error_code || "Finalizat"}</span>
                          <small>{t.duration_ms} ms</small>
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              CaseCheck <b>·</b> Fă loc pentru ceea ce contează.
            </span>
            <span>
              Foundation 0.1 <span className="live-dot" />
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setModal(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-case-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-top">
              <span className="modal-icon">
                <FolderOpen size={24} />
              </span>
              <button
                className="icon-button"
                aria-label="Închide"
                disabled={busy}
                onClick={() => setModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="eyebrow">UN NOU ÎNCEPUT</div>
            <h2 id="new-case-title">Adaugă un dosar.</h2>
            <p>
              Pornește de la documentele tale sintetice sau explorează un
              scenariu pregătit.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  const c = await post<Case>("/cases", { title });
                  await load();
                  await openCase(c.id);
                  setTab("documents");
                  setModal(false);
                  setTitle("");
                });
              }}
            >
              <label>
                Nume companie / dosar
                <input
                  autoFocus
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex. Atelier Demo SRL"
                />
              </label>
              <button className="primary full" disabled={busy}>
                Creează dosarul <ArrowRight size={16} />
              </button>
            </form>
            <div className="or">
              <span />
              SAU EXPLOREAZĂ DEMO-UL
              <span />
            </div>
            <label>
              Scenariu sintetic
              <select
                value={sample}
                onChange={(e) => setSample(Number(e.target.value))}
              >
                {samples.map((s, i) => (
                  <option value={i} key={s.label}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const id = await createSample(sample);
                  await load();
                  await openCase(id);
                  setTab("findings");
                  setModal(false);
                })
              }
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Sparkles size={16} />
              )}
              Încarcă și verifică scenariul
            </button>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <small>
              Rulează API-ul real cu observații predefinite. Fără AI simulat.
            </small>
          </section>
        </div>
      )}
    </div>
  );
}
