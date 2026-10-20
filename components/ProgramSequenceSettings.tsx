"use client";
import { useState } from 'react';
import type { PatientWorkspace } from '@/lib/types';
import { sessionExercises } from '@/lib/exercise-session';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export function ProgramSequenceSettings({workspace,onSaved,disabled=false}:{workspace:PatientWorkspace;onSaved:()=>Promise<void>;disabled?:boolean}) {
 const [guided,setGuided]=useState(workspace.program?.guided_order??false);
 const [dependencies,setDependencies]=useState<Record<string,string[]>>(()=>Object.fromEntries(workspace.programExercises.map(x=>[x.id,x.prerequisite_ids??[]])));
 const [status,setStatus]=useState('');
 const [saving,setSaving]=useState(false);
 const rows=sessionExercises(workspace.programExercises,workspace.programExercises.map(x=>x.id));
 if(!workspace.program)return null;
 return <details className="panel"><summary>Clinically required order and prerequisites</summary><form className="form" onSubmit={async e=>{
  e.preventDefault();if(saving||disabled)return;setSaving(true);setStatus('');
  try{const result=await createSupabaseBrowserClient().rpc('set_program_sequence',{p_program:workspace.program!.id,p_expected:workspace.program!.updated_at??null,p_guided:guided,p_dependencies:dependencies});if(result.error)throw result.error;await onSaved();setStatus('Exercise order saved.');}
  catch(e){setStatus(e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Could not save exercise order.');}finally{setSaving(false);}
 }}><fieldset disabled={saving||disabled} style={{border:0,padding:0}}>{disabled?<p>Save your program edits before changing order settings.</p>:null}<p>Use restrictions only for clinically necessary sequences. Save program edits before changing these settings.</p>
 <label><input type="checkbox" checked={guided} onChange={e=>setGuided(e.target.checked)}/> Require the full assigned order in each session</label>
 {!guided?rows.map((item,index)=><fieldset key={item.id}><legend>Before {item.exercise?.name??'exercise'}</legend>{index===0?<p>No earlier exercises.</p>:rows.slice(0,index).map(previous=><label key={previous.id}><input type="checkbox" checked={(dependencies[item.id]??[]).includes(previous.id)} onChange={e=>setDependencies(all=>({...all,[item.id]:e.target.checked?[...(all[item.id]??[]),previous.id]:(all[item.id]??[]).filter(id=>id!==previous.id)}))}/> {previous.exercise?.name??'Exercise'}</label>)}</fieldset>):null}
 <button type="submit" className="secondary-button" disabled={saving}>{saving?'Saving…':'Save required order'}</button><p role="status">{status}</p>
 </fieldset></form></details>;
}
