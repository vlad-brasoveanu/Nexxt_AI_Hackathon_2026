// Hold-to-sign: signing a credit decision takes a deliberate 1.5 s press (mouse, touch, Space or Enter),
// so it can never be confused with the agents' automatic actions.
import { useEffect, useRef, useState } from "react";
import { Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

const HOLD_MS = 1500;

export function HoldToSign({ label, disabled, onSigned, tone = "human" }: { label: string; disabled?: boolean; onSigned: () => void; tone?: "human" | "danger" }) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const done = useRef(false);

  const stop = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    start.current = null;
    if (!done.current) setProgress(0);
  };
  const tick = (now: number) => {
    if (start.current == null) start.current = now;
    const p = Math.min(1, (now - start.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      done.current = true;
      frame.current = null;
      onSigned();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (disabled || frame.current || done.current) return;
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);
  useEffect(() => { if (disabled) { done.current = false; setProgress(0); } }, [disabled]);

  return (
    <button type="button" disabled={disabled}
      onPointerDown={begin} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); begin(); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") stop(); }}
      aria-label={`${label} — ține apăsat 1,5 secunde pentru a semna`}
      className={cn("relative h-14 w-full select-none overflow-hidden border-2 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger" ? "border-danger text-danger" : "border-human text-foreground")}>
      <span className={cn("absolute inset-y-0 left-0", tone === "danger" ? "bg-danger" : "bg-human")} style={{ width: `${progress * 100}%` }} aria-hidden />
      <span className={cn("relative z-10 flex items-center justify-center gap-2.5", progress > 0.5 && (tone === "danger" ? "text-destructive-foreground" : "text-human-foreground"))}>
        <Fingerprint className="h-5 w-5" />
        {progress >= 1 ? "Semnat" : progress > 0 ? "Ține apăsat…" : label}
        {progress === 0 && <span className="hud-label text-[9.5px] opacity-70">ține apăsat</span>}
      </span>
    </button>
  );
}
