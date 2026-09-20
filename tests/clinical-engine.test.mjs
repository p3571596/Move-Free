import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
import vm from 'node:vm';
const mod = new Module('lib/clinical-engine.ts');
mod._compile(ts.transpileModule(fs.readFileSync('lib/clinical-engine.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'lib/clinical-engine.ts');
const { evaluateEngine, engineFields } = mod.exports;
const baseline = {redFlag:false,newNeuro:false,fracture:false,systemic:false,patternChange:false,adherence:90,sleep:'good',dailyLoad:'neutral',technique:'yes',exercisePain:3,painIncrease:1,recoveryHours:24,swelling:false,fatigue:false,otherAdverse:false,rpe:6,movement:'good',objective:'improving',function:'improving',painTrend:'improving',expected:'yes',psych:false};
const original = fs.readFileSync('docs/clinical-engine/original-v0.1.html','utf8').split('function runEngine(){')[1].split('\nfunction renderResult')[0];
function legacy(inputs) {
 const ctx={val:k=>inputs[k],num:k=>Number(inputs[k]||0),checked:k=>inputs[k]===true,getInputs:()=>inputs,renderResult:()=>{},Date};
 vm.runInNewContext('function runEngine(){'+original+'\nrunEngine();',ctx);
 return ctx.lastResult;
}
test('preserves all eight original branches and numerical boundaries',()=>{
 const cases=[{}, {redFlag:true}, {patternChange:true,expected:'no'}, {exercisePain:6}, {expected:'slower',adherence:89}, {expected:'no',psych:true}, {expected:'no'}, {rpe:7}, {painIncrease:2}, {painIncrease:2.5}, {exercisePain:5}, {recoveryHours:47}, {recoveryHours:48}, {adherence:89}, {adherence:90}];
 const seen=new Set();
 for(const patch of cases){const input={...baseline,...patch};const actual=evaluateEngine(input);const expected=legacy(input);seen.add(actual.ruleId);for(const field of ['recommendation','bottleneck','reasons','flags','urgency']) assert.equal(JSON.stringify(actual[field]),JSON.stringify(expected[field]),field);}
 assert.equal(seen.size,8);
});
test('missing, blank, unmeasured and invalid inputs never become normal',()=>{
 for(const key of Object.keys(engineFields)){
  const input={...baseline};delete input[key];
  assert.equal(evaluateEngine(input).status,'missing_information',key);
  for(const value of [null,'','unknown']) assert.equal(evaluateEngine({...baseline,[key]:value}).status,'missing_information',key);
 }
 for(const value of [-1,11,NaN,Infinity,'6']) assert.equal(evaluateEngine({...baseline,rpe:value}).status,'missing_information');
 assert.equal(evaluateEngine({}).ruleId,'integration.missing_information');
});
test('positive safety finding retains escalation despite other missing fields',()=>{
 const r=evaluateEngine({newNeuro:true});assert.equal(r.ruleId,'v0.1.safety');assert(r.missing.length);assert(!r.reasons.some(x=>x.includes('No adverse')));
});
test('deterministic combinations match recovered prototype exactly',()=>{
 let seed=513;const rnd=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
 for(let i=0;i<1000;i++){
  const input={};for(const [key,f] of Object.entries(engineFields)) input[key]=f.kind==='boolean'?rnd(10)===0:f.kind==='number'?rnd(f.max===100?101:f.max===10?11:73):Object.keys(f.options).filter(x=>x!=='unknown')[rnd(Object.keys(f.options).filter(x=>x!=='unknown').length)];
  const expected=legacy(input),actual=evaluateEngine(input);
  for(const field of ['recommendation','bottleneck','reasons','flags','urgency'])assert.equal(JSON.stringify(actual[field]),JSON.stringify(expected[field]));
 }
});
