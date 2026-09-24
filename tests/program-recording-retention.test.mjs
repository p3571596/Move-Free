import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
function load(file,deps={}){const m=new Module(file);m.require=n=>deps[n];m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const {saveProgramDraft,loadProgramExercises}=load('lib/data.ts',{'./exercise-media':load('lib/exercise-media.ts')});
function fixture(){
 const exercise={id:'exercise',clinician_id:'clinician',name:'Synthetic movement',category:'strength'};
 const tables={episodes:[{id:'episode',patient_id:'patient',status:'active'}],home_programs:[{id:'program',episode_id:'episode',status:'active'}],home_program_exercises:[{id:'assignment',home_program_id:'program',exercise_id:'exercise',exercise,dosage_sets:'2',sort_order:0},{id:'removable',home_program_id:'program',exercise_id:'exercise',exercise,sort_order:1}],exercise_video_assets:[{id:'video',program_exercise_id:'assignment',state:'approved'}],analytics_events:[]};
 let next=0;const writes=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'clinician'}},error:null})},from(table){let action='select',value,filters=[],order;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(k){order=k;return q},limit(){return q},update(v){action='update';value=v;return q},insert(v){action='insert';value=v;return q},delete(){action='delete';return q},single:async()=>{const r=await run();return {...r,data:r.data[0]}},maybeSingle:async()=>{const r=await run();return {...r,data:r.data[0]??null}},then(resolve,reject){return run().then(resolve,reject)}};
 async function run(){let rows=tables[table].filter(r=>filters.every(f=>f(r)));if(action!=='select')writes.push({table,action,ids:rows.map(r=>r.id)});if(action==='update')rows.forEach(r=>Object.assign(r,value));if(action==='insert'){rows=[{id:'new-'+(++next),...value,exercise}];tables[table].push(...rows);}if(action==='delete'){tables[table]=tables[table].filter(r=>!rows.includes(r));if(table==='home_program_exercises')tables.exercise_video_assets=tables.exercise_video_assets.filter(a=>!rows.some(r=>r.id===a.program_exercise_id));}if(order)rows.sort((a,b)=>a[order]-b[order]);return{data:structuredClone(rows),error:null};}return q;}};
 return{tables,client,writes,exercise};
}
test('saving dosage and adding an exercise preserves approved recording assignment and reload order',async()=>{
 const f=fixture();const original=f.tables.home_program_exercises[0];
 const saved=await saveProgramDraft(f.client,'patient',[{id:'draft-new',exercise:f.exercise,sets:1}, {...original,sets:3}]);
 assert.equal(saved.programExercises[1].id,'assignment');assert.equal(saved.programExercises[1].dosage_sets,'3');
 assert.deepEqual(f.tables.exercise_video_assets,[{id:'video',program_exercise_id:'assignment',state:'approved'}]);
 assert.deepEqual((await loadProgramExercises(f.client,'program')).map(x=>x.id),saved.programExercises.map(x=>x.id));
 assert.deepEqual(f.writes.filter(x=>x.table==='home_program_exercises'&&x.action==='delete').flatMap(x=>x.ids),['removable']);
});
test('removing an exercise with a recording fails before assignment changes or cascade deletion',async()=>{
 const f=fixture();await assert.rejects(saveProgramDraft(f.client,'patient',[f.tables.home_program_exercises[1]]),/recorded videos cannot be removed/);
 assert.equal(f.tables.exercise_video_assets.length,1);assert.equal(f.writes.filter(x=>x.table==='home_program_exercises').length,0);
});
