import type { Evidence } from './types';

/** The API stores Python/code-point offsets, whereas DOM ranges use UTF-16 offsets. */
export function evidenceSpan(page: string, evidence: Evidence): { start: number; end: number } | null {
  const characters = Array.from(page);
  if (!Number.isInteger(evidence.start) || !Number.isInteger(evidence.end) || evidence.start < 0 || evidence.end <= evidence.start || evidence.end > characters.length) return null;
  const quote = characters.slice(evidence.start, evidence.end).join('');
  if (quote !== evidence.quote) return null;
  return { start: characters.slice(0, evidence.start).join('').length, end: characters.slice(0, evidence.end).join('').length };
}

function compact(text: string) {
  let value = '', offset = 0;
  const starts: number[] = [], ends: number[] = [];
  for (const character of text) {
    const normalized = character.normalize('NFKC');
    for (const part of normalized) {
      if (/\s/u.test(part)) continue;
      value += part;
      for (let i = 0; i < part.length; i++) { starts.push(offset); ends.push(offset + character.length); }
    }
    offset += character.length;
  }
  return { value, starts, ends };
}

/** Match the cited occurrence, never just the first equal financial number on a page.
 * Only whitespace/font ligature normalization is allowed. Repeated values require a unique
 * surrounding source context in both extractions; otherwise no highlight is returned.
 */
export function locateEvidence(source: string, rendered: string, evidence: Evidence): { start: number; end: number } | null {
  const span = evidenceSpan(source, evidence);
  if (!span) return null;
  const original = compact(source), target = compact(rendered);
  const start = compact(source.slice(0, span.start)).value.length;
  const end = compact(source.slice(0, span.end)).value.length;
  if (end <= start) return null;
  for (const radius of [0, 12, 32, 64, 128, 256, 512]) {
    const left = Math.max(0, start - radius), right = Math.min(original.value.length, end + radius);
    const anchor = original.value.slice(left, right);
    if (original.value.indexOf(anchor) !== original.value.lastIndexOf(anchor)) continue;
    const found = target.value.indexOf(anchor);
    if (found < 0 || found !== target.value.lastIndexOf(anchor)) continue;
    const a = found + start - left, b = found + end - left - 1;
    if (target.starts[a] == null || target.ends[b] == null) return null;
    return { start: target.starts[a], end: target.ends[b] };
  }
  return null;
}
