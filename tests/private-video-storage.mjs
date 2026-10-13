// Replays a schema-only snapshot of the pre-release database; contains no patient data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const schema=JSON.parse(fs.readFileSync('tests/fixtures/pre-pilot-authorization-schema.json'));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create table auth.users(id uuid primary key);
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
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [clinician,patient,outsider,admin]=[1,2,3,4].map(id);
for(const [i,role]of ['clinician','patient','clinician','admin'].entries()){
 await db.query('insert into auth.users values($1)',[id(i+1)]);
 await db.query('insert into profiles(id,role,email) values($1,$2,$3)',[id(i+1),role,'synthetic-'+i+'@example.invalid']);
}
await db.query('insert into patients(id,clinician_id,patient_profile_id) values($1,$2,$3)',[id(10),clinician,patient]);
await db.query('insert into episodes(id,patient_id) values($1,$2)',[id(11),id(10)]);
await db.query('insert into exercises(id,clinician_id) values($1,$2)',[id(12),clinician]);
await db.query("insert into home_programs(id,episode_id,status) values($1,$2,'active')",[id(13),id(11)]);
await db.query('insert into home_program_exercises(id,home_program_id,exercise_id) values($1,$2,$3)',[id(14),id(13),id(12)]);
const as=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');};
const asset=async(n,owner,kind='demonstration',consent=false,size=20,mime='video/webm')=>db.query(`insert into exercise_video_assets(id,patient_id,program_exercise_id,owner_id,kind,object_path,mime_type,byte_size,consented_at,consent_notice_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id(n),id(10),id(14),owner,kind,id(n)+'/source',mime,size,consent?new Date():null,consent?'video-pilot-v1':null]);
const object=async(n,size=20)=>db.query("insert into storage.objects(bucket_id,name,metadata) values('exercise-video-preview',$1,$2)",[id(n)+'/source',{size,mimetype:'video/webm'}]);
const finish=n=>db.query('select finish_exercise_video($1)',[id(n)]);
const approve=n=>db.query("select approve_exercise_video($1,'Approved exercise','Move within your prescribed range','Slowly')",[id(n)]);
const count=async table=>(await db.query('select * from '+table)).rows.length;
await as(clinician);await asset(20,clinician);
await assert.rejects(finish(20),'missing object cannot finalize');
await assert.rejects(asset(90,clinician,'demonstration',false,26214401));
await assert.rejects(asset(91,clinician,'demonstration',false,20,'text/html'));
for(const who of [patient,outsider,admin]){await as(who);assert.equal(await count('exercise_video_assets'),0);await assert.rejects(object(20));await assert.rejects(approve(20));await assert.rejects(asset(90,who));}
await as(clinician);await object(20,19);await assert.rejects(finish(20),'size mismatch');
await db.exec('reset role');await db.query("update storage.objects set metadata=$1",[{size:20,mimetype:'video/webm'}]);
await as(clinician);await finish(20);
await assert.rejects(db.query("update exercise_video_assets set title='forged'"));
assert.equal((await db.query("update storage.objects set name='overwritten' returning id")).rows.length,0);
await as(patient);assert.equal(await count('exercise_video_assets'),0);assert.equal(await count('storage.objects'),0);
await as(clinician);await approve(20);
await as(patient);assert.equal(await count('exercise_video_assets'),1);assert.equal(await count('storage.objects'),1);
await assert.rejects(db.query('select withdraw_exercise_video($1)',[id(20)]));
await assert.rejects(asset(21,patient,'performance',false));
await asset(21,patient,'performance',true);await object(21);await finish(21);await assert.rejects(approve(21));
await as(clinician);assert.equal(await count('exercise_video_assets'),2);assert.equal(await count('storage.objects'),2);
await asset(22,clinician);await object(22);await finish(22);await approve(22);
await as(patient);assert.equal((await db.query("select id from exercise_video_assets where kind='demonstration'")).rows[0].id,id(22));
assert.equal(await count('storage.objects'),2,'old demonstration no longer readable');
for(const who of [outsider,admin]){await as(who);assert.equal(await count('exercise_video_assets'),0);assert.equal(await count('storage.objects'),0);await assert.rejects(finish(21));await assert.rejects(approve(22));await assert.rejects(db.query('select withdraw_exercise_video($1)',[id(21)]));}
await as(patient);await db.query('select withdraw_exercise_video($1)',[id(21)]);assert.equal(await count('storage.objects'),1);await db.exec("select set_config('storage.operation','object.delete_many',false)");await db.query('delete from storage.objects where name=$1',[id(21)+'/source']);await db.exec("select set_config('storage.operation','',false)");
await db.exec('reset role');assert.equal((await db.query('select * from storage.objects where name=$1',[id(21)+'/source'])).rows.length,0,'owner cleanup withdrawn bytes');
await db.query('update patients set clinician_id=$1 where id=$2',[outsider,id(10)]);
await as(clinician);assert.equal(await count('exercise_video_assets'),0);assert.equal(await count('storage.objects'),0);await assert.rejects(db.query('select withdraw_exercise_video($1)',[id(22)]));
await as(outsider);assert.equal(await count('exercise_video_assets'),3);await db.query('select withdraw_exercise_video($1)',[id(22)]);
await as(patient);assert.equal(await count('storage.objects'),0);
console.log('PASS: private drafts, approval-only publication, consent, upload size/MIME checks, no overwrite, replacement, withdrawal, patient/outsider/admin boundaries, relationship revocation and owner cleanup.');
await db.close();
