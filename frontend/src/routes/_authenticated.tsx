import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { FolderOpen, LogOut, ShieldCheck, Cpu } from "lucide-react";
import { api } from "@/lib/api";
import { healthQ, sessionQ } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/labels";
import type { User } from "@/lib/types";
import { Pill, ReadOnlyBadge } from "@/components/casecheck/bits";

export const Route = createFileRoute("/_authenticated")({
  component: Layout,
});

export function useUser(): User {
  const { data } = useQuery(sessionQ());
  return data!.user;
}

function AiPill() {
  const { data, isError } = useQuery(healthQ());
  if (!data && !isError) return null;
  if (!data?.ai_enabled) return <Pill tone="neutral"><Cpu className="h-3 w-3" /> AI dezactivat</Pill>;
  const model = data.ai.model.split("/").pop()?.replace(/-Instruct$/, "");
  return <Pill tone="neutral"><Cpu className="h-3 w-3" /> AI: {data.ai.provider} · {model} · {data.ai.mode}</Pill>;
}

function Layout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const session = useQuery(sessionQ());

  useEffect(() => {
    if (session.isSuccess && !session.data) nav({ to: "/login" });
  }, [session.isSuccess, session.data, nav]);

  if (!session.data) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Se încarcă…</div>;
  const user = session.data.user;

  async function logout() {
    try { await api.logout(); } catch { /* session may already be gone */ }
    qc.clear();
    qc.setQueryData(["session"], null);
    nav({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-sidebar-primary text-sidebar-primary-foreground"><ShieldCheck className="h-4 w-4" /></span>
          <span className="font-semibold tracking-tight">CaseCheck</span>
        </div>
        <nav className="flex-1 px-2">
          <Link
            to="/"
            className="flex items-center gap-2 rounded bg-sidebar-primary px-3 py-2 text-sm font-medium text-sidebar-primary-foreground"
          >
            <FolderOpen className="h-4 w-4" /> Dosare
          </Link>
        </nav>
        <div className="border-t border-sidebar-border p-3 space-y-2">
          <div className="text-sm font-medium">{user.username}</div>
          <div className="flex flex-wrap gap-1">
            <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-xs text-sidebar-accent-foreground">{ROLE_LABEL[user.role]}</span>
            {user.role === "supervisor" && <ReadOnlyBadge />}
          </div>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4" /> Deconectare
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b bg-warning-soft px-6 py-1.5 text-xs text-warning">
          <span>Date sintetice · document demonstrativ, fără valoare juridică</span>
          <AiPill />
        </div>
        <main className="flex-1 px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
