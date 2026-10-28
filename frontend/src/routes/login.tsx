import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { sessionQ } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground"><ShieldCheck className="h-5 w-5" /></span>
          <span className="text-xl font-semibold tracking-tight">CaseCheck</span>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-md border bg-card p-6 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="u">Utilizator</Label>
            <Input id="u" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p">Parolă</Label>
            <Input id="p" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy || !u || !p}>{busy ? "Se autentifică…" : "Autentificare"}</Button>
          <div className="rounded border border-dashed bg-muted px-3 py-2 text-xs text-muted-foreground">
            Conturi demo: <span className="font-mono">manager · analyst · supervisor</span> — parola <span className="font-mono">12345</span>
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">Date sintetice · document demonstrativ, fără valoare juridică</p>
      </div>
    </div>
  );
}
