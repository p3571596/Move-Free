import type { HomeProgramExercise } from './types';

export type ExerciseSession = {
  id: string; patient_id: string; home_program_id: string;
  selection_mode: 'full' | 'individual' | 'sections'; selected_ids: string[];
  current_exercise_id: string | null; state: 'active' | 'closed'; created_at?: string;
  program_version?: string | null;
};
export function sessionExercises(items: HomeProgramExercise[], selected: string[]) {
  return [...items].filter(item => selected.includes(item.id)).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.id.localeCompare(b.id));
}
export function prerequisiteMessage(item: HomeProgramExercise, items: HomeProgramExercise[], confirmed: string[], guided: boolean) {
  const ordered=sessionExercises(items,items.map(x=>x.id));
  const required=guided ? ordered.slice(0,ordered.findIndex(x=>x.id===item.id)).map(x=>x.id) : item.prerequisite_ids??[];
  return required.some(id=>!confirmed.includes(id)) ? 'Your therapist asks you to record the required exercises first.' : '';
}
export function includeRequiredExercises(items: HomeProgramExercise[], selected: string[], guided: boolean) {
 const result=new Set(selected), ordered=sessionExercises(items,items.map(x=>x.id));
 for(const item of [...ordered].reverse()) {
  if(!result.has(item.id))continue;
  const required=guided?ordered.slice(0,ordered.indexOf(item)).map(x=>x.id):item.prerequisite_ids??[];
  required.forEach(id=>result.add(id));
 }
 return ordered.filter(x=>result.has(x.id)).map(x=>x.id);
}
