import { doseBounds, prescriptionFor, validatePrescription, type Prescription, actualWithinPrescription } from './prescription';
import type { HomeProgramExercise, ExerciseAdherenceLog } from './types';

export type PlanPhase = {id:string; name:string; focus:string; goal:string; criteria:string; notes:string; startDate?:string; durationWeeks?:number};
export type DayExercise = {assignmentId:string; prescription:Prescription; notes:string; prerequisiteIds:string[]};
export type DayTemplate = {id:string; name:string; notes:string; weekdays:number[]; weeklyTarget?:Prescription['frequency']; scheduledOnly:boolean; minRestHours:number; exercises:DayExercise[]};
export type PlanWeek = {name:string; phaseId?:string; recovery:boolean; notes:string; templateIds:string[]; overrides:Record<string,Record<string,Prescription>>};
export type ProgressionPlan = {startDate:string; activeWeek:number; phases:PlanPhase[]; weeks:PlanWeek[]; templates:DayTemplate[]};
export function newProgressionPlan(items:HomeProgramExercise[],startDate=new Date().toLocaleDateString('en-CA')):ProgressionPlan {
 return {startDate,activeWeek:0,phases:[],weeks:[{name:'Week 1',recovery:false,notes:'',templateIds:['day-a'],overrides:{}}],templates:[{id:'day-a',name:'Strength A',notes:'',weekdays:[],scheduledOnly:false,minRestHours:0,exercises:items.map(x=>({assignmentId:x.id,prescription:structuredClone(prescriptionFor(x)),notes:x.notes??'',prerequisiteIds:x.prerequisite_ids??[]}))}]};
}
export function validateProgressionPlan(plan:ProgressionPlan,items:HomeProgramExercise[]) {
 if(!plan||!/^\d{4}-\d{2}-\d{2}$/.test(plan.startDate)||!Number.isFinite(Date.parse(plan.startDate))||new Date(plan.startDate).toISOString().slice(0,10)!==plan.startDate)throw new Error('Choose a valid plan start date.');
 if(!Number.isInteger(plan.activeWeek)||plan.activeWeek<0||plan.activeWeek>=plan.weeks.length||plan.weeks.length>104||!plan.templates.length||plan.templates.length>30||plan.phases.length>30)throw new Error('Choose an existing week and 1–30 day templates.');
 const unique=(ids:(string|number)[])=>new Set(ids).size===ids.length;
 if(!unique(plan.templates.map(x=>x.id))||!unique(plan.phases.map(x=>x.id)))throw new Error('Use unique phase and template IDs.');
 for(const p of plan.phases)if(!p.id||!p.name.trim()||(p.durationWeeks!==undefined&&(!Number.isInteger(p.durationWeeks)||p.durationWeeks<1||p.durationWeeks>104)))throw new Error('Check phase name and duration.');
 for(const day of plan.templates){
  if(!day.id||!day.name.trim()||!day.exercises.length||day.exercises.length>100||!unique(day.exercises.map(x=>x.assignmentId))||!unique(day.weekdays)||day.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)||!Number.isFinite(day.minRestHours)||day.minRestHours<0||day.minRestHours>720)throw new Error('Check day template name, exercises, weekdays and recovery spacing.');
  if(day.weeklyTarget){validatePrescription({frequency:day.weeklyTarget});if(!['days/week','sessions/week'].includes(day.weeklyTarget.unit))throw new Error('Use a weekly target for day templates.');}
  day.exercises.forEach((x,index)=>{if(!items.some(i=>i.id===x.assignmentId)||x.prerequisiteIds.some(id=>!day.exercises.slice(0,index).some(e=>e.assignmentId===id)))throw new Error('Save assignments first; prerequisites must be earlier exercises in this template.');validatePrescription(x.prescription);});
 }
 for(const w of plan.weeks){
  if(!w.name.trim()||!w.templateIds.length||!unique(w.templateIds)||w.templateIds.some(id=>!plan.templates.some(t=>t.id===id))||(w.phaseId&&!plan.phases.some(p=>p.id===w.phaseId)))throw new Error('Check week name, phase and day templates.');
  for(const [tid,overrides]of Object.entries(w.overrides)){const day=plan.templates.find(t=>t.id===tid);if(!w.templateIds.includes(tid)||!day)throw new Error('Invalid weekly day override.');for(const [id,p] of Object.entries(overrides)){if(!day.exercises.some(x=>x.assignmentId===id))throw new Error('Invalid weekly exercise override.');validatePrescription(p);}}
 }
 if(JSON.stringify(plan).length>500000)throw new Error('Progression plan is too large.');
}
export function weekStart(plan:ProgressionPlan,index=plan.activeWeek){const date=new Date(`${plan.startDate}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+index*7);return date.toISOString().slice(0,10);}
export function templateExercises(plan:ProgressionPlan,templateId:string,items:HomeProgramExercise[],week=plan.activeWeek):HomeProgramExercise[]{
 const day=plan.templates.find(t=>t.id===templateId);if(!day||!plan.weeks[week]?.templateIds.includes(templateId))return [];
 return day.exercises.flatMap((e,i)=>{const item=items.find(x=>x.id===e.assignmentId);return item?[{...item,prescription:plan.weeks[week].overrides[templateId]?.[item.id]??e.prescription,notes:e.notes,prerequisite_ids:[...new Set([...(item.prerequisite_ids??[]),...e.prerequisiteIds])],sort_order:i,category:day.name}]:[];});
}
export function suggestedTemplateDate(plan:ProgressionPlan,day:DayTemplate|undefined,today:string){
 const start=weekStart(plan),dates=Array.from({length:7},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 const eligible=dates.filter(d=>!day?.weekdays.length||day.weekdays.includes(new Date(d+'T00:00:00Z').getUTCDay()));
 return eligible.find(d=>d>=today)??eligible[0]??start;
}
export function scheduleMessage(day:DayTemplate,scheduledDate:string,performedDate:string,lastPerformedAt?:string,now=new Date()){
 if(day.scheduledOnly&&(scheduledDate!==performedDate||(day.weekdays.length&&!day.weekdays.includes(new Date(`${performedDate}T00:00:00Z`).getUTCDay()))))return 'Your clinician has limited this template to its scheduled days.';
 if(lastPerformedAt&&now.getTime()-Date.parse(lastPerformedAt)<day.minRestHours*3600000)return `Your clinician asks for ${day.minRestHours} hours between sessions for this template.`;
 return '';
}
export function progressionInsights(logs:ExerciseAdherenceLog[]){
 const counts=new Map<string,{count:number;recordIds:string[]}>();
 for(const log of logs){
  if(log.activity_source!=='individual_confirmation'||(!log.actual_dose&&!log.actual_reps_by_set?.length)||!log.prescription_snapshot)continue;
  const snapshot=log.prescription_snapshot as unknown as {prescription?:Prescription};
  if(!snapshot.prescription||actualWithinPrescription(snapshot.prescription,log.actual_dose??{},log.actual_reps_by_set??undefined)!=='within')continue;
  const b=doseBounds(snapshot.prescription.reps);const reps=log.actual_reps_by_set??(log.actual_dose?.reps?.value!=null?[log.actual_dose!.reps!.value!]:[]);
  if(!b||!reps.length||!reps.every(n=>n===b.max))continue;
  const key=`${log.home_program_exercise_id}:${JSON.stringify(snapshot.prescription)}`,previous=counts.get(key)??{count:0,recordIds:[]};counts.set(key,{count:previous.count+1,recordIds:[...previous.recordIds,log.id]});
 }
 return [...counts.entries()].filter(([,v])=>v.count>=2).map(([key,value])=>({assignmentId:key.split(':')[0],...value,message:'Repeated reported repetitions at the upper prescribed value. Review symptoms, difficulty, movement quality and functional goals where available before considering a change. Missing evidence remains unknown.'}));
}
