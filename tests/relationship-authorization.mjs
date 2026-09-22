// Replays a schema-only snapshot of the pre-release database; contains no patient data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const schema=JSON.parse(fs.readFileSync('tests/fixtures/pre-pilot-authorization-schema.json'));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,private to authenticated;`);
for(const table of new Set(schema.columns.map(c=>c.table))){
 const cols=schema.columns.filter(c=>c.table===table).map(c=>`${quote(c.column)} ${c.type.startsWith('_')?c.type.slice(1)+'[]':c.type}${c.default?' default '+c.default:''}${c.column==='id'?' primary key':''}`);
 await db.exec(`create table public.${quote(table)}(${cols.join(',')});alter table public.${quote(table)} enable row level security;`);
}
// Private helpers must exist before the public wrappers are parsed.
for(const f of schema.functions.sort((a,b)=>Number(!a.includes('FUNCTION private.'))-Number(!b.includes('FUNCTION private.'))))await db.exec(f);
await db.exec('grant all on all tables in schema public to authenticated;grant execute on all functions in schema private to authenticated;');
for(const p of schema.policies)await db.exec(`create policy ${quote(p.policyname)} on public.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''};`);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [clinician,patient,outsider,admin]=[1,2,3,4].map(id);
for(const [i,role]of ['clinician','patient','clinician','admin'].entries())await db.query('insert into profiles(id,role,email) values($1,$2,$3)',[id(i+1),role,'synthetic-'+i+'@example.invalid']);
await db.query('insert into patients(id,clinician_id,patient_profile_id) values($1,$2,$3)',[id(10),clinician,patient]);
await db.query('insert into episodes(id,patient_id) values($1,$2)',[id(11),id(10)]);
await db.query('insert into exercises(id,clinician_id) values($1,$2)',[id(12),clinician]);
await db.query('insert into home_programs(id,episode_id) values($1,$2)',[id(13),id(11)]);
await db.query('insert into home_program_exercises(id,home_program_id,exercise_id) values($1,$2,$3)',[id(14),id(13),id(12)]);
for(const t of ['goals','progress_metrics'])await db.query(`insert into ${t}(id,episode_id) values($1,$2)`,[id(15),id(11)]);
for(const t of ['clinical_decisions','visit_notes'])await db.query(`insert into ${t}(id,patient_id,clinician_id) values($1,$2,$3)`,[id(16),id(10),clinician]);
for(const t of ['barriers','daily_checkins','exercise_adherence_logs','analytics_events'])await db.query(`insert into ${t}(id,patient_id) values($1,$2)`,[t==='analytics_events'?17:id(17),id(10)]);
const as=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');};
await as(patient);await db.query("update profiles set role='admin' where id=$1",[patient]);
assert.equal((await db.query('select is_admin() as value')).rows[0].value,true,'reproduce role escalation');
await db.exec('reset role');await db.query("update profiles set role='patient' where id=$1",[patient]);
await db.exec(fs.readFileSync('supabase/migrations/20260921235753_enforce_pilot_relationship_authorization.sql','utf8'));
for(const user of [patient,clinician,outsider,admin]){await as(user);await assert.rejects(db.query("update profiles set role='admin' where id=$1",[user]));await db.query("update profiles set full_name='SYNTHETIC updated' where id=$1",[user]);}
await as(id(5));await assert.rejects(db.query("insert into profiles(id,email,role) values($1,'synthetic-new@example.invalid','admin')",[id(5)]));
await db.query("insert into profiles(id,email,role) values($1,'synthetic-new@example.invalid','clinician')",[id(5)]);
const tables=['patients','episodes','exercises','home_programs','home_program_exercises','goals','progress_metrics','clinical_decisions','visit_notes','barriers','daily_checkins','exercise_adherence_logs','analytics_events'];
for(const user of [outsider,admin]){await as(user);for(const table of tables){assert.equal((await db.query(`select id from ${table}`)).rows.length,0,`${user} cannot read ${table}`);assert.equal((await db.query(`update ${table} set id=id returning id`)).rows.length,0,`${user} cannot update ${table}`);assert.equal((await db.query(`delete from ${table} returning id`)).rows.length,0,`${user} cannot delete ${table}`);}await assert.rejects(db.query('insert into episodes(id,patient_id) values($1,$2)',[id(18),id(10)]));}
for(const user of [patient,clinician]){await as(user);for(const table of tables.filter(t=>t!=='analytics_events'))assert.equal((await db.query(`select id from ${table}`)).rows.length,1,`${user} retains ${table} access`);}
await as(patient);assert.equal((await db.query("update home_programs set patient_explanation='forged' returning id")).rows.length,0);
await assert.rejects(db.query('insert into clinical_decisions(id,patient_id,clinician_id) values($1,$2,$3)',[id(19),id(10),patient]));
await as(clinician);assert.equal((await db.query("update home_programs set patient_explanation='approved' returning id")).rows.length,1);
await db.exec('reset role');await db.query('update patients set clinician_id=$1 where id=$2',[outsider,id(10)]);await as(clinician);assert.equal((await db.query('select id from patients')).rows.length,0,'revoked clinician loses access');
console.log('PASS: reproduced and blocked self-promotion; contact edits preserved; unrelated clinician/admin denied reads/writes/deletes across 13 clinical tables; patient and treating clinician retained access; patient treatment edits denied; relationship revocation enforced.');
await db.close();
