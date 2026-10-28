import type React from "react";
import { Layers3 } from "lucide-react";
import { labels } from "./labels";
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${["FAIL", "ESCALATED", "PROCESSING_FAILED"].includes(value) ? "red" : ["PASS", "READY_FOR_REVIEW"].includes(value) ? "green" : "amber"}`}
    >
      <span />
      {labels[value] || value}
    </span>
  );
}
export function Logo() {
  return (
    <div className="brand">
      <span>
        <Layers3 size={22} strokeWidth={2.4} />
      </span>
      casecheck<span className="brand-dot">.</span>
    </div>
  );
}
export function Stat({
  label,
  value,
  sub,
  icon,
  accent = "",
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <section className={`stat ${accent}`}>
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <small>{sub}</small>
    </section>
  );
}
