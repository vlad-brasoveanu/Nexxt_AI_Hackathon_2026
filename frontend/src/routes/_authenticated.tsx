import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Activity, Command as CommandIcon, Cpu, FolderSearch, Gauge, LineChart, LogOut, Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { healthQ, sessionQ } from "@/lib/queries";
import { roleLabel } from "@/lib/labels";
import { shortModel } from "@/lib/format";
import { currentTheme, toggleTheme, type Theme } from "@/lib/theme";
import type { User } from "@/lib/types";
import { CommandPalette } from "@/components/casecheck/command-palette";
import { Kbd } from "@/components/casecheck/hud";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: Layout,
});

export function useUser(): User {
  const { data } = useQuery(sessionQ());
  return data!.user;
}

const NAV = [
  { to: "/", label: "Coada de lucru", icon: Activity, exact: true },
  { to: "/piata", label: "Piață și politică", icon: LineChart, exact: false },
  { to: "/metrici", label: "Metrici", icon: Gauge, exact: false },
  { to: "/kyc", label: "Dosare KYC", icon: FolderSearch, exact: false },
] as const;

function ModeLabel() {
  const { data, isError } = useQuery(healthQ());
  if (!data && !isError) return null;
  const on = data?.ai_enabled;
  return (
    <span className="hud-label inline-flex items-center gap-1.5 text-muted-foreground" title="Modul de procesare al agenților">
      <Cpu className={cn("h-3 w-3", on ? "text-agent-text" : "")} />
      {on ? `${data!.ai.mode === "cloud" ? "Cloud demo" : "Local"} · ${data!.ai.provider} · ${shortModel(data!.ai.model)}` : "Mod determinist · fără AI"}
      <span className="text-border-strong">·</span> date sintetice
    </span>
  );
}

function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  useEffect(() => {
    const sync = () => setThemeState(currentTheme());
    window.addEventListener("casecheck-theme", sync);
    return () => window.removeEventListener("casecheck-theme", sync);
  }, []);
  return (
    <button onClick={toggleTheme} aria-label={theme === "dark" ? "Temă luminoasă" : "Temă întunecată"}
      className="inline-flex h-8 w-8 items-center justify-center border border-border hover:border-border-strong hover:bg-surface-2">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function Layout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const session = useQuery(sessionQ());

  useEffect(() => {
    if (session.isSuccess && !session.data) nav({ to: "/login" });
  }, [session.isSuccess, session.data, nav]);

  if (!session.data) {
    return <div className="flex min-h-screen items-center justify-center"><span className="hud-label animate-pulse text-muted-foreground">Se încarcă…</span></div>;
  }
  const user = session.data.user;

  async function logout() {
    try { await api.logout(); } catch { /* session may already be gone */ }
    qc.clear();
    qc.setQueryData(["session"], null);
    nav({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <Link to="/" className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
          <span className="relative flex h-8 w-8 items-center justify-center border border-sidebar-foreground/70">
            <svg viewBox="0 0 28 28" className="h-5 w-5" aria-hidden><path d="M7 14.5l4.5 4.5L21 9" stroke="var(--agent)" strokeWidth="3.2" fill="none" /></svg>
          </span>
          <span className="leading-tight">
            <span className="block font-[family-name:var(--font-display)] text-[17px] font-bold tracking-tight">CaseCheck</span>
            <span className="hud-label text-[9.5px] text-sidebar-muted">camera de control</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <Link key={to} to={to} activeOptions={{ exact }}
              className="group flex items-center gap-2.5 border-l-2 border-transparent px-3 py-2 text-[13.5px] text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "!border-agent !text-sidebar-foreground bg-sidebar-accent" }}>
              <Icon className="h-4 w-4" />{label}
            </Link>
          ))}
          <button onClick={() => window.dispatchEvent(new Event("casecheck-palette"))}
            className="mt-3 flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-sidebar-muted hover:text-sidebar-foreground">
            <CommandIcon className="h-4 w-4" />Comenzi<span className="ml-auto flex gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
          </button>
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="num truncate text-[13px]">{user.username}</div>
              <div className="hud-label mt-1 text-[9.5px] text-agent-text">{roleLabel(user.role)}</div>
            </div>
            <ThemeToggle />
          </div>
          <button onClick={logout} className="flex w-full items-center gap-2 px-1 py-1 text-[12.5px] text-sidebar-muted hover:text-sidebar-foreground">
            <LogOut className="h-3.5 w-3.5" /> Deconectare
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center justify-between gap-3 border-b px-6">
          <span className="hud-label text-warning">Date sintetice · demonstrație, fără valoare juridică</span>
          <ModeLabel />
        </div>
        <main className="hud-grid flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
