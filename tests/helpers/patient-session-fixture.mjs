import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
export async function patientSessionFixture(){
const db=new PGlite(), schema=JSON.parse(fs.readFileSync('tests/fixtures/pre-pilot-authorization-schema.json'));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,private to authenticated;`);
for(const table of new Set(schema.columns.map(c=>c.table))){const cols=schema.columns.filter(c=>c.table===table).map(c=>`${quote(c.column)} ${c.type.startsWith('_')?c.type.slice(1)+'[]':c.type}${c.default?' default '+c.default:''}${c.column==='id'?' primary key':''}`);await db.exec(`create table public.${quote(table)}(${cols.join(',')});alter table public.${quote(table)} enable row level security;`);}
for(const f of schema.functions.sort((a,b)=>Number(!a.includes('FUNCTION private.'))-Number(!b.includes('FUNCTION private.'))))await db.exec(f);
await db.exec('grant all on all tables in schema public to authenticated;grant execute on all functions in schema private to authenticated;');
for(const p of schema.policies)await db.exec(`create policy ${quote(p.policyname)} on public.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''};`);
await db.exec('alter table clinical_decisions add constraint clinical_decisions_clinician_id_fkey foreign key(clinician_id) references profiles(id); alter table visit_notes add constraint visit_notes_clinician_id_fkey foreign key(clinician_id) references profiles(id);');
for(const name of ['20260921235753_enforce_pilot_relationship_authorization','20260921235847_clinical_engine_pilot','20260922002657_preserve_legacy_clinician_pilot_writes','20261004115925_stage1_adaptive_followups','20261004174821_preserve_followup_switch_cooldown'])await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
for(const [n,role] of [[1,'clinician'],[2,'patient'],[3,'clinician'],[4,'admin']]){await db.query('insert into auth.users values($1)',[id(n)]);await db.query('insert into profiles(id,role) values($1,$2)',[id(n),role]);}
await db.query("insert into patients(id,clinician_id,patient_profile_id,status) values($1,$2,$3,'active')",[id(10),id(1),id(2)]);
await db.query("insert into episodes(id,patient_id,status) values($1,$2,'active')",[id(11),id(10)]);
await db.query("insert into home_programs(id,episode_id,status,assigned_at) values($1,$2,'active',now())",[id(12),id(11)]);
await db.query("insert into exercises(id,clinician_id,name,normalized_name,video_url,default_dosage,is_active) values($1,$2,'Standard heel raise','standard heel raise','https://www.youtube.com/watch?v=M7lc1UVf-VE','2 x 8 as tolerated',true)",[id(20),id(1)]);
for(const [n,reps] of [[13,'8'],[14,'8–10'],[15,'30 seconds']])await db.query("insert into home_program_exercises(id,home_program_id,exercise_id,dosage_sets,dosage_reps,frequency,notes,sort_order) values($1,$2,$3,'2',$4,'3x/week','Original cues',$5)",[id(n),id(12),id(20),reps,n]);
await db.query("insert into exercise_adherence_logs(id,patient_id,home_program_id,home_program_exercise_id,completion_status) values($1,$2,$3,$4,'completed')",[id(30),id(10),id(12),id(13)]);
await db.exec(fs.readFileSync('supabase/migrations/20261009212333_stage1_structured_prescriptions.sql','utf8'));

await db.exec("create unique index if not exists session_exercise_test on public.exercise_adherence_logs(patient_id,session_id,home_program_exercise_id) where session_id is not null and home_program_exercise_id is not null;");
await db.exec(fs.readFileSync('supabase/migrations/20261020202607_patient_directed_sessions.sql','utf8'));

return {db,id};
}
