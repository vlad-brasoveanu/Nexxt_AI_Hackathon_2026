import type { AgentId, AgentRun, AgentState, AgentStep } from './agent-types';

export const EXECUTION_AGENTS = ['completeness','financials','cashflow','kyb','analyst','policy','memo','critic'] as const;
export type ExecutionAgent = typeof EXECUTION_AGENTS[number];
export function dispatchedAgent(step: AgentStep): ExecutionAgent | null {
  const target=step.task?.split('.')[0];
  return EXECUTION_AGENTS.includes(target as ExecutionAgent)?target as ExecutionAgent:null;
}

/** An unfinished dispatch is an actual server event, not a staged progress animation. */
export function executionState(run: AgentRun | null) {
  const steps=run?.steps??[];
  const lastDispatch=[...steps].reverse().find(s=>s.kind==='dispatch'&&dispatchedAgent(s));
  const finished=lastDispatch&&steps.some(s=>s.seq>lastDispatch.seq&&s.task===lastDispatch.task&&['result','challenge','error','refused'].includes(s.kind));
  const pending=run?.status==='RUNNING'&&lastDispatch&&!finished?dispatchedAgent(lastDispatch):null;
  const active=run?.status==='RUNNING'?(run.agents.find(a=>a.status==='running'&&EXECUTION_AGENTS.includes(a.id as ExecutionAgent))?.id??pending):null;
  const states=Object.fromEntries(EXECUTION_AGENTS.map(id=>{
    let status:AgentState=run?.agents.find(a=>a.id===id)?.status??'idle';
    if(run&&!run.is_current&&status==='done')status='stale';
    return [id,status];
  })) as Record<ExecutionAgent,AgentState>;
  if(pending)states[pending]='running';
  return {active:active as AgentId|null,states,lastDispatch,completed:EXECUTION_AGENTS.filter(id=>states[id]==='done').length};
}
