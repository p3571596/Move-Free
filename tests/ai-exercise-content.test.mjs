import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import Module from 'node:module';import ts from 'typescript';
const load=(f,deps={})=>{const m=new Module(f);m.require=k=>deps[k];m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);return m.exports;};
const p=load('lib/prescription.ts'),a=load('lib/ai-exercise-content.ts',{'./prescription':p});
test('explicit spoken prescription supports numerical value/unit fields; visual repetition counts never prescribe',()=>{
 const transcript='I demonstrate five squats. Perform two sets of eight repetitions twice daily.';
 const quote='Perform two sets of eight repetitions twice daily.';
 const content={...a.blankAIExercise(),name:'Squat',instructions:'Bend and straighten your knees.',prescription:{sets:{value:2,unit:'sets'},reps:{value:8,unit:'reps'},frequency:{value:2,unit:'sessions/day'},hold:{value:5,unit:'sec'}}};
 const evidence=[{field:'name',source:'visual',quote:'Standing knee bend',certainty:'supported'},...['sets','reps','frequency'].map(field=>({field,source:'speech',quote,certainty:'supported'}))];
 assert.deepEqual(a.supportedAIExercise(content,evidence,transcript).prescription,{sets:{value:2,unit:'sets'},reps:{value:8,unit:'reps'},frequency:{value:2,unit:'sessions/day'}});
 for(const quote of ['I demonstrate five squats.','Do 8 to 10 repetitions.','Show five repetitions.','Perform five repetitions.']){
  const result=a.supportedAIExercise({...content,prescription:{reps:{value:8,unit:'reps'}}},[{field:'reps',source:'speech',quote,certainty:'supported'}],quote);assert.deepEqual(result.prescription,{});
 }
 assert.deepEqual(a.supportedAIExercise({...content,prescription:{reps:{value:5,unit:'reps'}}},[{field:'reps',source:'visual',quote:'Five squats',certainty:'supported'}],'').prescription,{});
});
test('unknown, fabricated speech, unsupported units and dosage hidden in prose fail closed',()=>{
 const quote='Perform two sets.';const c={...a.blankAIExercise(),instructions:'Do 5 repetitions.',prescription:{sets:{value:2,unit:'sets'}}};
 assert.deepEqual(a.supportedAIExercise(c,[{field:'sets',source:'speech',quote,certainty:'supported'}],'No dosage spoken.').prescription,{});
 assert.equal(a.supportedAIExercise(c,[{field:'instructions',source:'visual',quote:'Knee bend',certainty:'supported'}],quote).instructions,'');
 assert.throws(()=>a.validateAIExercise({...c,prescription:{reps:{value:'8',unit:'reps'}}}));assert.throws(()=>a.validateAIExercise({...c,patientId:'never allowed'}));
});
