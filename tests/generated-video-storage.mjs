// Replays a schema-only snapshot of the pre-release database; contains no patient data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const schema=JSON.parse(fs.readFileSync('tests/fixtures/pre-pilot-authorization-schema.json'));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
await db.exec(`create role service_role bypassrls;create role anon;create role authenticated;create schema auth;create schema private;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
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

await db.exec(fs.readFileSync('supabase/migrations/20260921235753_enforce_pilot_relationship_authorization.sql','utf8'));
await db.exec(`create schema storage;
create function storage.allow_any_operation(expected text[]) returns boolean language sql stable as $$select coalesce(current_setting('storage.operation',true)=any(expected),false)$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_stage2_private_exercise_video.sql'));
await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261013133128_stage2_private_pilot_gate.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261013140019_clinician_ai_exercise_drafts.sql','utf8'));
await db.exec("alter table home_program_exercises add column prescription jsonb default '{}', add column patient_name text;");
await db.exec(fs.readFileSync('supabase/migrations/20261013163303_generated_exercise_video_pilot.sql','utf8'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
for(const [n,role] of [[1,'clinician'],[2,'patient'],[3,'clinician']]){await db.query('insert into auth.users values($1,now())',[id(n)]);await db.query('insert into profiles(id,role) values($1,$2)',[id(n),role]);}
await db.query('insert into patients(id,clinician_id,patient_profile_id) values($1,$2,$3)',[id(10),id(1),id(2)]);
await db.query('insert into episodes(id,patient_id) values($1,$2)',[id(11),id(10)]);
await db.query('insert into exercises(id,clinician_id) values($1,$2)',[id(12),id(1)]);
await db.query("insert into home_programs(id,episode_id,status) values($1,$2,'active')",[id(13),id(11)]);
await db.query('insert into home_program_exercises(id,home_program_id,exercise_id) values($1,$2,$3)',[id(14),id(13),id(12)]);
const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
await as(1);await assert.rejects(db.query("select begin_video_generation($1,'squat')",[id(20)]));
await db.exec('reset role');await db.query("insert into private.clinician_feature_grants values($1,'ai_video_generation',true,null),($1,'personalized_exercises',true,null)",[id(1)]);await as(1);
assert.equal((await db.query("select pilot_feature_enabled('ai_video_assistance') enabled")).rows[0].enabled,false);
await db.query("select begin_video_generation($1,'squat')",[id(20)]);
await db.query("select begin_video_generation($1,'squat')",[id(20)]);
assert.equal((await db.query('select id from clinician_video_generation_jobs')).rows.length,1);
await assert.rejects(db.query("select begin_video_generation($1,'squat')",[id(21)]));
await assert.rejects(db.query('select provider_operation from clinician_video_generation_jobs'));
await assert.rejects(db.query("update clinician_video_generation_jobs set status='ready'"));
const content={name:'Squat',instructions:'Move within reviewed range.',cues:'Control the movement.',exercise_type:'strength',equipment:'',prescription:{reps:{value:8,unit:'reps'}}};
const checks={viewed:true,movement:true,instructions:true,fitt:true};
await assert.rejects(db.query('select review_generated_video($1,$2,$3)',[id(20),content,checks]));
await db.exec('reset role');await db.query("update clinician_video_generation_jobs set status='ready',object_path=id::text||'/source.mp4' where id=$1",[id(20)]);
await db.query("insert into storage.objects(bucket_id,name,metadata) values('exercise-generation-private',$1,$2)",[id(20)+'/source.mp4',{size:20,mimetype:'video/mp4'}]);
await as(2);assert.equal((await db.query('select id from clinician_video_generation_jobs')).rows.length,0);assert.equal((await db.query("select * from storage.objects where bucket_id='exercise-generation-private'")).rows.length,0);
await as(3);await assert.rejects(db.query('select review_generated_video($1,$2,$3)',[id(20),content,checks]));
await as(1);await assert.rejects(db.query('select review_generated_video($1,$2,$3)',[id(20),content,{...checks,fitt:false}]));await assert.rejects(db.query('select review_generated_video($1,$2,$3)',[id(20),{...content,prescription:{reps:{value:'8',unit:'reps'}}},checks]));
await db.query('select review_generated_video($1,$2,$3)',[id(20),content,checks]);
assert.equal((await db.query('select * from exercise_video_assets')).rows.length,0,'review never assigns');
await db.query("insert into exercise_video_assets(id,patient_id,program_exercise_id,owner_id,kind,object_path,mime_type,byte_size,generated_job_id) values($1,$2,$3,$4,'demonstration',$5,'video/mp4',20,$6)",[id(30),id(10),id(14),id(1),id(30)+'/source',id(20)]);
await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('exercise-video-preview',$1,$2)",[id(30)+'/source',{size:20,mimetype:'video/mp4'}]),'clients cannot substitute generated bytes');
await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name,metadata) values('exercise-video-preview',$1,$2)",[id(30)+'/source',{size:20,mimetype:'video/mp4'}]);await as(1);
await db.query('select finish_exercise_video($1)',[id(30)]);
await assert.rejects(db.query("select approve_exercise_video($1,'Squat','Move within reviewed range.','Control the movement.')",[id(30)]),'generic approval bypass denied');
await assert.rejects(db.query('select assign_generated_video($1,$2)',[id(20),id(30)]),'unsaved dose denied');
await db.exec('reset role');await db.query("update home_program_exercises set prescription=$1,patient_name='Squat' where id=$2",[content.prescription,id(14)]);await as(1);
await db.query('select assign_generated_video($1,$2)',[id(20),id(30)]);
assert.equal((await db.query('select state from exercise_video_assets')).rows[0].state,'approved');
await as(2);assert.equal((await db.query('select state from exercise_video_assets')).rows[0].state,'approved');assert.equal((await db.query('select id from clinician_video_generation_jobs')).rows.length,0);
await db.exec('reset role');await db.query("update private.clinician_feature_grants set enabled=false where feature='ai_video_generation'");await as(1);await assert.rejects(db.query("select begin_video_generation($1,'squat')",[id(21)]));
await db.exec('reset role');await db.query("update private.clinician_feature_grants set enabled=true where feature='ai_video_generation'");await as(1);
for(let n=21;n<=31;n++){await db.query("select begin_video_generation($1,'squat')",[id(n)]);await db.exec('reset role');await db.query("update clinician_video_generation_jobs set status='failed' where id=$1",[id(n)]);await as(1);}
await assert.rejects(db.query("select begin_video_generation($1,'squat')",[id(32)]),'13th attempt exceeds $5');
console.log('PASS: separate generation gate, idempotency, provider reference secrecy, clinician-only drafts, explicit movement/instruction/FITT review, numerical validation, no auto-assignment, no substituted media, saved-dose equality, approved patient playback, revocation and daily cost cap.');await db.close();
