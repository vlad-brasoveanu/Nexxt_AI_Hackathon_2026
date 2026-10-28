// ⌘K / Ctrl+K command palette: jump to a case or a screen, switch the theme.
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, FolderSearch, Gauge, LineChart, Moon, Sun } from "lucide-react";
import { creditCasesQ } from "@/lib/queries";
import { currentTheme, toggleTheme } from "@/lib/theme";
import { fmtRon } from "@/lib/format";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const cases = useQuery({ ...creditCasesQ(), enabled: open });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("casecheck-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("casecheck-palette", onOpen);
    };
  }, []);

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const item = "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm aria-selected:bg-agent-soft aria-selected:text-foreground text-muted-foreground";

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Comenzi"
      overlayClassName="fixed inset-0 z-50 bg-[var(--scrim)]"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[min(560px,92vw)] -translate-x-1/2 border border-border-strong bg-popover hud-cut">
      <Command.Input placeholder="Caută un dosar sau o comandă…" className="w-full border-b bg-transparent px-4 py-3.5 text-[15px] outline-none placeholder:text-muted-foreground" />
      <Command.List className="max-h-[52vh] overflow-y-auto py-2">
        <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">Niciun rezultat.</Command.Empty>
        <Command.Group heading="Ecrane" className="[&_[cmdk-group-heading]]:hud-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-muted-foreground">
          <Command.Item className={item} onSelect={() => go(() => nav({ to: "/" }))}><Activity className="h-4 w-4" />Coada de lucru</Command.Item>
          <Command.Item className={item} onSelect={() => go(() => nav({ to: "/piata" }))}><LineChart className="h-4 w-4" />Piață și politică</Command.Item>
          <Command.Item className={item} onSelect={() => go(() => nav({ to: "/metrici" }))}><Gauge className="h-4 w-4" />Metrici</Command.Item>
          <Command.Item className={item} onSelect={() => go(() => nav({ to: "/kyc" }))}><FolderSearch className="h-4 w-4" />Dosare KYC</Command.Item>
          <Command.Item className={item} onSelect={() => go(toggleTheme)}>
            {currentTheme() === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}Schimbă tema
          </Command.Item>
        </Command.Group>
        {(cases.data ?? []).length > 0 && (
          <Command.Group heading="Dosare de credit" className="[&_[cmdk-group-heading]]:hud-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-muted-foreground">
            {(cases.data ?? []).map((c) => (
              <Command.Item key={c.id} value={`${c.company} ${c.cui}`} className={item}
                onSelect={() => go(() => nav({ to: "/credit/$id", params: { id: c.id } }))}>
                <span className="flex-1 truncate text-foreground">{c.company}</span>
                <span className="num text-xs">{fmtRon(c.amount)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
