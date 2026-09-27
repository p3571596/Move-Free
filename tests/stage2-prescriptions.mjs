// Replays a schema-only snapshot of the pre-release database; contains no patient data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const schema=JSON.parse(fs.readFileSync('tests/fixtures/pre-pilot-authorization-schema.json'));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;create table auth.users(id uuid primary key);
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

await db.exec(fs.readFileSync('supabase/migrations/20260925002446_stage2_prescription_drafts.sql','utf8'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [clinician,patient,outsider,admin]=[1,2,3,4].map(id);
for(const [i,role] of ['clinician','patient','clinician','admin'].entries()){
 await db.query('insert into auth.users values($1)',[id(i+1)]);
 await db.query('insert into profiles(id,role,email) values($1,$2,$3)',[id(i+1),role,`synthetic-${i}@example.invalid`]);
}
await db.query('insert into patients(id,clinician_id,patient_profile_id) values($1,$2,$3)',[id(10),clinician,patient]);
await db.query('insert into episodes(id,patient_id) values($1,$2)',[id(11),id(10)]);
await db.query("insert into exercises(id,clinician_id,name) values($1,$2,'Standard squat')",[id(12),clinician]);
await db.query("insert into home_programs(id,episode_id,status) values($1,$2,'active')",[id(13),id(11)]);
await db.query('insert into home_program_exercises(id,home_program_id,exercise_id) values($1,$2,$3)',[id(14),id(13),id(12)]);
const as=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');};
const content={name:'Patient squat',instructions:'Sit and stand slowly.',cues:'Look forward',equipment:'Chair',category:'strength',frequency:'twice daily',intensity:'',sets:'2',reps:'8',hold:'5 seconds',duration:'',rest:'',type:'Sit to stand'};
const act=(action,n=20,p=content,revision=0)=>db.query('select stage2_draft($1,$2,$3,$4,$5,$6)',[action,id(n),id(10),id(13),p,revision]);
const media=(action,n=30,d=20)=>db.query("select stage2_media($1,$2,$3,20,'video/webm')",[action,id(n),id(d)]);
const count=async t=>(await db.query('select * from '+t)).rows.length;
await as(clinician);await act('create');await media('create');
await assert.rejects(media('finish'),'unfinished upload cannot finalize');
await db.query("insert into storage.objects(bucket_id,name,metadata) values('exercise-creation-private',$1,$2)",[id(30)+'/source',{size:20,mimetype:'video/webm'}]);await media('finish');
await assert.rejects(db.query("update exercise_creation_drafts set state='approved'"),'direct publication denied');
for(const who of [patient,outsider,admin]){await as(who);assert.equal(await count('exercise_creation_drafts'),0);assert.equal(await count('exercise_creation_media'),0);assert.equal(await count('storage.objects'),0);await assert.rejects(act('approve'));await assert.rejects(media('withdraw'));await assert.rejects(db.query('select stage2_begin_ai($1,$2)',[id(20),id(30)]));}
await as(clinician);const run=(await db.query('select stage2_begin_ai($1,$2) id',[id(20),id(30)])).rows[0].id;
await assert.rejects(db.query('select stage2_begin_ai($1,$2)',[id(20),id(30)]),'rate limit');
await db.exec('reset role');await db.query("update exercise_ai_runs set status='success',original_draft=$1 where id=$2",[{...content,reps:'6'},run]);
await as(clinician);await act('save');await assert.rejects(act('approve'),'stale revision denied');
const assigned=(await act('approve',20,content,1)).rows[0].stage2_draft;
assert.equal(await count('exercises'),1,'personalized exercise does not enter library');
const revision=(await db.query('select * from exercise_prescription_revisions')).rows[0];assert(revision.changed_fields.includes('reps'));assert.equal(revision.ai_run_id,run);
await assert.rejects(act('approve',20,content,1),'approval cannot repeat');
await as(patient);assert.equal(await count('exercise_creation_drafts'),0);assert.equal(await count('exercise_ai_runs'),0);assert.equal(await count('exercise_prescription_revisions'),0);assert.equal(await count('exercise_creation_media'),1);assert.equal(await count('storage.objects'),1);
await db.query('select stage2_video_played($1)',[id(30)]);await db.query('select stage2_video_played($1)',[id(30)]);
await as(clinician);assert.equal(await count('exercise_creation_events'),1);
const items=[{id:id(14),template_id:id(12),expected_version:0,content:{...content,name:'Patient-specific standard'}},{id:assigned,template_id:null,expected_version:1,content}];
await db.query('select stage2_save_program($1,$2,$3)',[id(13),id(10),items]);
assert.equal((await db.query('select name from exercises')).rows[0].name,'Standard squat','template remains unchanged');
assert.equal((await db.query('select prescription from home_program_exercises where id=$1',[id(14)])).rows[0].prescription.name,'Patient-specific standard');
await assert.rejects(db.query('select stage2_save_program($1,$2,$3)',[id(13),id(10),items]),'stale save rejected atomically');
for(const who of [outsider,admin]){await as(who);assert.equal(await count('exercise_creation_media'),0);assert.equal(await count('storage.objects'),0);await assert.rejects(db.query('select stage2_save_program($1,$2,$3)',[id(13),id(10),items]));}
await as(clinician);
// Replacement must preserve the previous approved assignment until new approval.
await act('create',21,{assignment_id:assigned});await media('create',31,21);
await db.query("insert into storage.objects(bucket_id,name,metadata) values('exercise-creation-private',$1,$2)",[id(31)+'/source',{size:20,mimetype:'video/webm'}]);await media('finish',31,21);
await as(patient);assert.equal(await count('storage.objects'),1,'replacement draft remains private');
await as(clinician);const replacement=(await act('approve',21,{...content,name:'Replacement'},0)).rows[0].stage2_draft;
assert.equal(replacement,assigned,'replacement keeps assignment ID and adherence links');
await as(patient);assert.equal((await db.query('select name from storage.objects')).rows[0].name,id(31)+'/source','only current approved recording is readable');
await as(clinician);await media('withdraw',31,21);
await media('withdraw');await as(patient);assert.equal(await count('storage.objects'),0,'withdrawal blocks playback');
await as(clinician);await db.exec("select set_config('storage.operation','object.delete_many',false)");await db.query('delete from storage.objects where name=any($1)',[[id(30)+'/source',id(31)+'/source']]);await db.exec("select set_config('storage.operation','',false)");
await db.exec('reset role');assert.equal(await count('storage.objects'),0,'withdrawn bytes removable');
await db.query('update patients set clinician_id=$1 where id=$2',[outsider,id(10)]);await as(clinician);assert.equal(await count('exercise_creation_drafts'),0);await assert.rejects(act('create',21));
console.log('PASS: clinician/patient/outsider/admin RLS, immutable AI audit, rate limit, unfinished upload, approval, stale revisions, standard editing isolation, no personalized library writes, playback events, withdrawal, byte deletion, revoked care relationship.');
await db.close();
