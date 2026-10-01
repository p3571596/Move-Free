// Replay real authorization schema with synthetic data, then exercise the actual migration.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const schema=JSON.parse(fs.readFileSync('tests/fixtures/pre-pilot-authorization-schema.json'));const quote=s=>'"'+s.replaceAll('"','""')+'"';
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,private to authenticated;`);
for(const table of new Set(schema.columns.map(c=>c.table))){const cols=schema.columns.filter(c=>c.table===table).map(c=>`${quote(c.column)} ${c.type.startsWith('_')?c.type.slice(1)+'[]':c.type}${c.default?' default '+c.default:''}${c.column==='id'?' primary key':''}`);await db.exec(`create table public.${quote(table)}(${cols.join(',')});alter table public.${quote(table)} enable row level security;`);}
for(const f of schema.functions.sort((a,b)=>Number(!a.includes('FUNCTION private.'))-Number(!b.includes('FUNCTION private.'))))await db.exec(f);
await db.exec('grant all on all tables in schema public to authenticated;grant execute on all functions in schema private to authenticated;');
for(const p of schema.policies)await db.exec(`create policy ${quote(p.policyname)} on public.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''};`);
await db.exec(fs.readFileSync('supabase/migrations/20260921235753_enforce_pilot_relationship_authorization.sql','utf8'));
await db.exec("alter table episodes add constraint episodes_status_check check(status in ('active','paused','completed','archived'));");
await db.exec(fs.readFileSync('supabase/migrations/20261001131749_stage1_case_lifecycle.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261001132422_allow_discharged_episode_status.sql','utf8'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
for(const [i,role] of ['clinician','patient','clinician','admin'].entries()){await db.query('insert into auth.users values($1)',[id(i+1)]);await db.query('insert into profiles(id,role) values($1,$2)',[id(i+1),role]);}
await db.query("insert into patients(id,clinician_id,patient_profile_id,status,goal) values($1,$2,$3,'active','Walk independently')",[id(10),id(1),id(2)]);
await db.query("insert into episodes(id,patient_id,status,start_date) values($1,$2,'active',current_date-30)",[id(11),id(10)]);
await db.query("insert into goals(id,episode_id,title,current_value) values($1,$2,'Walking','30')",[id(12),id(11)]);
await db.query("insert into home_programs(id,episode_id,status,name) values($1,$2,'active','Synthetic program')",[id(13),id(11)]);
await db.query("insert into daily_checkins(id,patient_id,episode_id,pain_score) values($1,$2,$3,2)",[id(14),id(10),id(11)]);
const as=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');};
const change=(action='discharge',plan='ended',episode=id(11))=>db.query("select transition_case($1,$2,$3,$4,current_date,$5,'Synthetic lifecycle test')",[id(10),episode,action,action==='discharge'?'Goals met':'Same condition recurring',plan]);
for(const actor of [2,3,4]){await as(id(actor));await assert.rejects(change());assert.equal((await db.query('select * from case_lifecycle_events')).rows.length,0);}
await db.exec('reset role;set role anon');await assert.rejects(change());
await as(id(1));await assert.rejects(change('discharge','ended',id(99)));
await assert.rejects(db.query("select transition_case($1,$2,'discharge','Goals met',current_date+1,'ended','')",[id(10),id(11)]));
await change();assert.equal((await db.query('select status from patients')).rows[0].status,'discharged');assert.equal((await db.query('select status from episodes')).rows[0].status,'discharged');assert.equal((await db.query('select status from home_programs')).rows[0].status,'archived');
assert.equal((await db.query('select * from daily_checkins')).rows.length,1);assert.equal((await db.query('select * from goals')).rows.length,1);
const event=(await db.query('select * from case_lifecycle_events')).rows[0];assert.equal(event.snapshot.programs[0].status,'active');assert.equal(event.snapshot.goals[0].current_value,'30');
await assert.rejects(change());await assert.rejects(db.query("update case_lifecycle_events set reason='Forged'"));await assert.rejects(db.query('delete from case_lifecycle_events'));
await change('reactivate','review_required');assert.equal((await db.query('select status from patients')).rows[0].status,'needs_review');assert.equal((await db.query('select status from home_programs')).rows[0].status,'archived');assert.equal((await db.query('select * from case_lifecycle_events')).rows.length,2);
await db.query("update home_programs set status='active'");await change('discharge','independent');assert.equal((await db.query('select status from home_programs')).rows[0].status,'active');
await as(id(2));assert.equal((await db.query('select * from daily_checkins')).rows.length,1);assert.equal((await db.query('select * from home_programs')).rows.length,1);await assert.rejects(change('reactivate','review_required'));
await as(id(1));await db.query("insert into episodes(id,patient_id,status) values($1,$2,'active')",[id(20),id(10)]);await assert.rejects(change('reactivate','review_required'));assert.equal((await db.query('select status from patients')).rows[0].status,'discharged');
await db.exec('reset role');await db.query('update patients set clinician_id=$1',[id(3)]);await as(id(1));assert.equal((await db.query('select * from case_lifecycle_events')).rows.length,0);await assert.rejects(change());
console.log('PASS lifecycle: authorized discharge/reactivation, snapshots/history preserved, ended and independent programs, no automatic prescription restart, stale/invalid/conflicting changes rejected, anonymous/patient/unrelated/admin denied, append-only RLS, revoked relationship denied.');await db.close();
