import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
const mod=new Module('session');mod._compile(ts.transpileModule(fs.readFileSync('lib/exercise-session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'session');
const {includeRequiredExercises,prerequisiteMessage,sessionExercises}=mod.exports;
const items=[{id:'a',sort_order:0},{id:'b',sort_order:1,prerequisite_ids:['a']},{id:'c',sort_order:2,prerequisite_ids:['b']}];
test('selection adds required preparation transitively without confirmations',()=>{
 assert.deepEqual(includeRequiredExercises(items,['c'],false),['a','b','c']);
 assert.deepEqual(includeRequiredExercises(items,['b'],true),['a','b']);
 assert.deepEqual(includeRequiredExercises(items.map(x=>({...x,prerequisite_ids:[]})),['c'],false),['c']);
 assert(prerequisiteMessage(items[2],items,[],false));assert.equal(prerequisiteMessage(items[2],items,['b'],false),'');
 assert.deepEqual(sessionExercises(items,['c','a']).map(x=>x.id),['a','c']);
});
