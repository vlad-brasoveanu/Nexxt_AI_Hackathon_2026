import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError, isMock } from "@/lib/api";
import { sessionQ } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const session = useQuery(sessionQ());
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session.data) nav({ to: "/" });
  }, [session.data, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const s = await api.login(u, p);
      qc.setQueryData(["session"], s);
      nav({ to: "/" });
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 401 ? "Utilizator sau parolă incorectă." : "Autentificarea a eșuat.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hud-grid flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <span className="hud-label text-agent-text">Camera de control a agentului</span>
          <h1 className="text-[40px] font-bold leading-none tracking-tight">CaseCheck</h1>
          <p className="text-[15px] text-muted-foreground">Agenții pregătesc dosarele de credit IMM. Oamenii decid.</p>
        </div>
        <form onSubmit={submit} className="hud-cut space-y-4 border bg-card p-6">
          <div className="space-y-1.5">
            <Label htmlFor="u" className="hud-label text-muted-foreground">Utilizator</Label>
            <Input id="u" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus className="rounded-none" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p" className="hud-label text-muted-foreground">Parolă</Label>
            <Input id="p" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" className="rounded-none" />
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
          <Button type="submit" className="h-11 w-full rounded-none" disabled={busy || !u || !p}>{busy ? "Se autentifică…" : "Autentificare"}</Button>
          <div className="border border-dashed px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">
            Conturi demo, parola <span className="num text-foreground">12345</span>:<br />
            <span className="num">{isMock() ? "manager · analyst · risk_officer (mock UI)" : "officer · risk · admin"}</span>
          </div>
        </form>
        <p className="hud-label text-center text-warning">Date sintetice · fără valoare juridică</p>
      </div>
    </div>
  );
}
