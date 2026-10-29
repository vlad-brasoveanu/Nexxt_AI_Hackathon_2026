import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceSpan, locateEvidence} from '../src/lib/evidence-highlight.ts';

test('selects the cited repeated amount using its row context',()=>{
 const source='Venit 1.000\nProfit 1.000';
 assert.deepEqual(locateEvidence(source,'Venit1.000Profit1.000',{start:19,end:24,quote:'1.000'}),{start:16,end:21});
});
test('fails closed when repeated source context is still ambiguous',()=>{
 assert.equal(locateEvidence('1.000 1.000','1.0001.0001.0001.000',{start:0,end:5,quote:'1.000'}),null);
});
test('rejects a quote that does not match its stored source offsets',()=>{
 assert.equal(locateEvidence('Venit 100','Venit100',{start:6,end:9,quote:'999'}),null);
 assert.equal(evidenceSpan('100',{start:-1,end:2,quote:'10'}),null);
 assert.equal(evidenceSpan('100',{start:0,end:4,quote:'100'}),null);
});
test('converts Python code-point offsets to DOM UTF-16 positions',()=>{
 assert.deepEqual(evidenceSpan('😀 Venit 100',{start:8,end:11,quote:'100'}),{start:9,end:12});
});
test('matches split PDF text and font ligatures without dropping numeric punctuation',()=>{
 assert.deepEqual(locateEvidence('Oficiu: 1.200,50','Oﬁciu:1.200,50',{start:8,end:16,quote:'1.200,50'}),{start:6,end:14});
 assert.equal(locateEvidence('Sold 1.200,50','Sold1200,50',{start:5,end:13,quote:'1.200,50'}),null);
});
test('does not substitute a missing value with another nearby number',()=>{
 assert.equal(locateEvidence('Venit 100','Venit900',{start:6,end:9,quote:'100'}),null);
});
