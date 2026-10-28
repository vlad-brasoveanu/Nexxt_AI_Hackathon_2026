// Romanian number / time formatting. Hand-rolled (no Intl) so output is identical in every browser and in tests.

const MINUS = "−";

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** 7900000 -> "7.900.000" */
export function fmtInt(n: number): string {
  const r = Math.round(Math.abs(n));
  return (n < 0 && r !== 0 ? MINUS : "") + group(String(r));
}

/** 7900000 -> "7.900.000 RON" */
export const fmtRon = (n: number) => `${fmtInt(n)} RON`;

/** 1.0939 -> "1,09" (decimal comma, proper minus sign) */
export function fmtNum(n: number, decimals = 2): string {
  const fixed = Math.abs(n).toFixed(decimals);
  const [i = "0", f] = fixed.split(".");
  const neg = n < 0 && Number(fixed) !== 0;
  return (neg ? MINUS : "") + group(i) + (f ? `,${f}` : "");
}

export const fmtPct = (n: number, decimals = 1) => `${fmtNum(n, decimals)}%`;
export const fmtSignedPct = (n: number, decimals = 1) => `${n > 0 ? "+" : ""}${fmtPct(n, decimals)}`;
export const fmtX = (n: number, decimals = 2) => `${fmtNum(n, decimals)}x`;

/** 1234 ms -> "1,2 s"; 840 -> "840 ms" */
export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${fmtNum(ms / 1000, 1)} s`;
}

/** 65 -> "1 min 05 s"; 38 -> "38 s" */
export function fmtDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null) return "—";
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m} min ${String(r).padStart(2, "0")} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")} min`;
}

/** 83 -> "01:23" */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const parse = (iso: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);

/** "acum 3 min", "acum 2 h", "acum 4 zile" */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const diff = Math.max(0, Math.round((now - parse(iso)) / 1000));
  if (diff < 10) return "chiar acum";
  if (diff < 60) return `acum ${diff} s`;
  const m = Math.round(diff / 60);
  if (m < 60) return `acum ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `acum ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "acum o zi" : `acum ${d} zile`;
}

/** Age without the "acum" prefix: "3 h", "2 zile". */
export function fmtAge(iso: string | null | undefined, now = Date.now()): string {
  return fmtAgo(iso, now).replace(/^acum /, "").replace("chiar acum", "< 10 s");
}

export function fmtClockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(parse(iso));
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** "2026-10-27" -> "27.10.2026" */
export function fmtIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export const shortModel = (model: string) => model.split("/").pop()?.replace(/-Instruct$/, "") ?? model;
