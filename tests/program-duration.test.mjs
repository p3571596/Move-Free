import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
function load(file, dependencies={}) {
 const mod=new Module(file);mod.require=name=>dependencies[name];
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
 return mod.exports;
}
const media=load('lib/exercise-media.ts');
const {loadProgramExercises,updateExerciseVideo}=load('lib/data.ts',{'./exercise-media':media});
test('loading a duration or repetition range preserves the prescription without inventing zero reps',async()=>{
 const rows=['30 seconds','8–10','8'].map((dosage_reps,i)=>({id:String(i),dosage_sets:'2',dosage_reps}));
 const query={select(){return this},eq(){return this},order:async()=>({data:rows,error:null})};
 const items=await loadProgramExercises({from:()=>query},'synthetic-program');
 assert.deepEqual(items.map(x=>x.dosage_reps),['30 seconds','8–10','8']);
 assert.deepEqual(items.map(x=>x.reps),[null,null,8]);
 assert.deepEqual(items.map(x=>media.formatRepsOrTime(x.dosage_reps)),['30 seconds','8–10 reps','8 reps']);
});

test('program video edits update only media under clinician ownership, including removal',async()=>{
 let payload;const filters=[];
 const query={update(value){payload=value;return this},eq(key,value){filters.push([key,value]);return this},select(){return this},single:async()=>({data:{id:'exercise',...payload},error:null})};
 const client={from:table=>{assert.equal(table,'exercises');return query}};
 await updateExerciseVideo(client,'exercise','clinician','https://youtu.be/M7lc1UVf-VE');
 assert.deepEqual(payload,{video_url:'https://www.youtube.com/watch?v=M7lc1UVf-VE'});
 assert.deepEqual(filters,[['id','exercise'],['clinician_id','clinician']]);
 await updateExerciseVideo(client,'exercise','clinician',null);assert.deepEqual(payload,{video_url:null});
 await assert.rejects(()=>updateExerciseVideo(client,'exercise','clinician','https://example.com/video'));
});
