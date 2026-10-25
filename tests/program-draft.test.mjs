import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
const m=new Module('program-draft');m._compile(ts.transpileModule(fs.readFileSync('lib/program-draft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'program-draft');
const {programHasUnsavedChanges}=m.exports;
test('successful save rendering keys never block a cycle; clinical edits still do',()=>{
 const saved=[{id:'assignment',prescription:{sets:{value:2,unit:'sets'}},notes:'Cue'}];
 assert.equal(programHasUnsavedChanges(saved.map(x=>({...x,client_key:'draft-key'})),saved),false);
 for(const patch of [{notes:'Different cue'},{prescription:{sets:{value:3,unit:'sets'}}},{patient_name:'New patient name'}])assert.equal(programHasUnsavedChanges(saved.map(x=>({...x,...patch,client_key:'draft-key'})),saved),true);
 assert.equal(programHasUnsavedChanges([],saved),true);
});
