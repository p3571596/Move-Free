import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import Module from 'node:module';import ts from 'typescript';
process.env.TZ='America/New_York';
function load(file){const m=new Module(file);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const {buildTrendPoints}=load('lib/pilot-insights.ts');const {formatDate}=load('lib/format.ts');
test('evening reports use the same local day in trend labels and timestamps',()=>{
 const points=buildTrendPoints([{id:'synthetic',created_at:'2026-09-21T00:15:00Z',patient_comment:'Synthetic evening check-in'}],[],10000);
 assert.equal(points[0].date,'2026-09-20');assert.equal(formatDate(points[0].date),'Sep 20, 2026');assert.equal(formatDate('2026-09-21T00:15:00Z'),'Sep 20, 2026');
});
test('date-only clinical dates do not shift to the previous calendar day',()=>{assert.equal(formatDate('2026-09-21'),'Sep 21, 2026');});
