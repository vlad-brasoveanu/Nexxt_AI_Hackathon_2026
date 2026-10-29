import test from 'node:test';
import assert from 'node:assert/strict';
import {executionState,EXECUTION_AGENTS} from '../src/lib/agent-execution.ts';
const run=(steps,agents=[])=>({status:'RUNNING',is_current:true,steps,agents});
const dispatch=(seq,task)=>({seq,task,agent:'orchestrator',kind:'dispatch'});
const result=(seq,task)=>({seq,task,agent:task.split('.')[0],kind:'result'});

test('an unstarted analysis has eight waiting agents and no fabricated activity',()=>{
 const state=executionState(null);assert.equal(state.active,null);assert.equal(state.completed,0);assert.deepEqual(Object.values(state.states),Array(8).fill('idle'));
});
test('a committed dispatch exposes the actual target while the next board snapshot is loading',()=>{
 const state=executionState(run([dispatch(1,'cashflow.analyze')],[{id:'cashflow',status:'done'}]));
 assert.equal(state.active,'cashflow');assert.equal(state.states.cashflow,'running');assert.equal(state.completed,0);
});
test('a finished dispatch does not make the last specialist appear active during planning',()=>{
 const state=executionState(run([dispatch(1,'critic.review'),result(2,'critic.review')],[{id:'critic',status:'done'}]));
 assert.equal(state.active,null);assert.equal(state.states.critic,'done');
});
test('a critic recheck is distinguished from its previous completed execution',()=>{
 const state=executionState(run([dispatch(1,'critic.review'),result(2,'critic.review'),dispatch(3,'critic.review')],[{id:'critic',status:'done'}]));
 assert.equal(state.active,'critic');assert.equal(state.states.critic,'running');
});
test('terminal and outdated analyses do not animate or count stale work as current completion',()=>{
 const state=executionState({...run([],EXECUTION_AGENTS.map(id=>({id,status:'done'}))),status:'AWAITING_DECISION',is_current:false});
 assert.equal(state.active,null);assert.equal(state.completed,0);assert.deepEqual(Object.values(state.states),Array(8).fill('stale'));
});
