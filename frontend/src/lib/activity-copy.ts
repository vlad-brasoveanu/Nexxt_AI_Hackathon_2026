import type { AgentId, AgentState, AgentStep } from './agent-types';

/** Concise employee copy; the original result is retained in execution details. */
export function activitySummary(agent: AgentId, text: string | null, state: AgentState = 'done'): string {
  if (state === 'failed' || state === 'blocked') return text || (state === 'failed' ? 'Procesarea a eșuat. Deschide rezultatul pentru detalii.' : 'Verificarea nu poate continua.');
  if (!text) return state === 'idle' ? 'Va începe când sunt disponibile datele necesare.' : state === 'running' ? 'Verifică datele disponibile…' : 'Nu există încă un rezultat disponibil.';
  if (state === 'running') return text;
  if (agent === 'memo' && /generată|redactată|notă de credit/i.test(text)) return 'Nota de credit este pregătită pentru verificare.';
  if (agent === 'analyst') return text.split(/\. Comparație/)[0] + (text.includes('. Comparație') ? '.' : '');
  if (agent === 'kyb') return text.split('; KYC:')[0];
  if (agent === 'policy') return text.split('; reguli eșuate:')[0];
  return text;
}
export function activityTitle(step: AgentStep): string {
  if (step.kind === 'refused') return 'Acțiune blocată: este necesară o decizie umană.';
  return step.kind === 'result' && step.status !== 'failed' && step.status !== 'refused' ? activitySummary(step.agent, step.title) : step.title;
}
