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
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
for(const n of [1,2]){await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[id(n)]);await db.query("insert into profiles(id,role) values($1,'clinician')",[id(n)]);}
const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
await as(1);await assert.rejects(db.query('select begin_clinician_ai_draft(true)'));
await db.exec('reset role');await db.query("insert into private.clinician_feature_grants values($1,'ai_video_assistance',true,null)",[id(1)]);await as(1);
await assert.rejects(db.query('select begin_clinician_ai_draft(false)'));
const run=(await db.query('select begin_clinician_ai_draft(true) as id')).rows[0].id;
await assert.rejects(db.query('select begin_clinician_ai_draft(true)'),'cooldown');await assert.rejects(db.query("update clinician_ai_exercise_drafts set status='success'"),'clients cannot forge provider output');
await as(2);assert.equal((await db.query('select * from clinician_ai_exercise_drafts')).rows.length,0);await assert.rejects(db.query('select review_clinician_ai_draft($1,$2)',[run,{}]));
await db.exec('reset role');const content={name:'Squat',exercise_type:'strength',instructions:'Bend your knees.',cues:'Move slowly.',equipment:'',prescription:{sets:{value:2,unit:'sets'},reps:{value:8,unit:'reps'}}};
await db.query("update clinician_ai_exercise_drafts set status='success',original_content=$1 where id=$2",[content,run]);
await as(1);await assert.rejects(db.query('select review_clinician_ai_draft($1,$2)',[run,{...content,patientId:id(5)}]));
await assert.rejects(db.query('select review_clinician_ai_draft($1,$2)',[run,{...content,prescription:{sets:{value:'2',unit:'sets'}}}]));
await db.query('select review_clinician_ai_draft($1,$2)',[run,{...content,prescription:{sets:{value:2,unit:'sets'},reps:{value:10,unit:'reps'}}}]);
const row=(await db.query('select * from clinician_ai_exercise_drafts')).rows[0];assert.equal(row.status,'reviewed');assert.equal(row.original_content.prescription.reps.value,8);assert.equal(row.reviewed_content.prescription.reps.value,10);assert.deepEqual(row.changed_fields,['prescription']);
await assert.rejects(db.query('select review_clinician_ai_draft($1,$2)',[run,content]));await db.exec('reset role');await db.query('update private.clinician_feature_grants set enabled=false');await as(1);assert.equal((await db.query('select * from clinician_ai_exercise_drafts')).rows.length,0);
console.log('PASS: independently gated clinician-only AI drafts, mandatory self-demonstration, serialized cooldown, no forged outputs, outsider denial, numerical validation, immutable originals/corrections, no automatic patient assignment and revoked access.');await db.close();
