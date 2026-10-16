import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

test('SMS and copy links retain verified identity, share throttles and reject stale callbacks', async () => {
 const db = new PGlite({extensions:{pgcrypto}});
 const owner='10000000-0000-0000-0000-000000000001', right='10000000-0000-0000-0000-000000000002', wrong='10000000-0000-0000-0000-000000000003', patient='20000000-0000-0000-0000-000000000001';
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private; create schema extensions; create extension pgcrypto schema extensions;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table profiles(id uuid primary key,role text,email text);
 create table patients(id uuid primary key,clinician_id uuid,patient_profile_id uuid,patient_invite_token_hash text,patient_invite_expires_at timestamptz,updated_at timestamptz);
 grant usage on schema auth,private to authenticated; grant execute on function auth.uid() to authenticated;
 insert into patients(id,clinician_id) values('${patient}','${owner}');
 insert into auth.users values('${right}','patient@example.invalid',now()),('${wrong}','wrong@example.invalid',now());`);
 for(const name of ['20261010220722_secure_patient_invitation_replacement.sql','20261016221136_sms_patient_invitations.sql','20261016221539_finalize_copy_invitation_atomically.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const issue=async(method='sms',action='send',phone='+12025550123',consent=true)=>(await db.query('select public.manage_patient_delivery($1,$2,$3,$4,$5,$6) result',[patient,'patient@example.invalid',method==='sms'?phone:'',method,action,consent])).rows[0].result;
 const finish=async a=>{await db.exec('reset role; set role service_role');return (await db.query('select public.finish_patient_email_invitation($1,$2,true,null) ok',[patient,a.attemptId])).rows[0].ok;};
 const callback=async(a,status)=>{await db.exec('reset role; set role service_role');return(await db.query('select public.record_patient_sms($1,$2,$3) ok',[a.attemptId,'SM'+'a'.repeat(32),status])).rows[0].ok;};
 const age=async()=>{await db.exec("reset role; update private.patient_email_invitations set attempted_at=now()-interval '3 minutes'");};
 await as(wrong);await assert.rejects(issue(),/access denied/);
 await as(owner);await assert.rejects(issue('sms','send','+12025550123',false),/consent/);
 const sms=await issue();await as(right);await assert.rejects(db.query('select private.claim_patient_invite($1)',[sms.token]),/invalid/);
 assert.equal(await callback(sms,'queued'),true);assert.equal(await finish(sms),true);
 await as(wrong);await assert.rejects(db.query('select private.claim_patient_invite($1)',[sms.token]),/invalid/);
 await as(owner);await assert.rejects(issue(),/60 seconds/);await assert.rejects(issue('sms','replace','+12025550124'),/60 seconds/);
 await age();await as(owner);const replacement=await issue('sms','replace','+12025550124');assert.equal(await callback(sms,'delivered'),false);
 await finish(replacement);assert.equal(await callback(replacement,'delivered'),true);assert.equal(await callback(replacement,'queued'),false);
 await as(owner);await db.query("select manage_patient_email_invitation($1,'','revoke')",[patient]);assert.equal(await callback(replacement,'sent'),false);
 await age();await as(owner);const copy=await issue('copy','replace');
 await as(right);assert.equal((await db.query('select private.claim_patient_invite($1) id',[copy.token])).rows[0].id,patient);
 await assert.rejects(db.query('select private.claim_patient_invite($1)',[copy.token]),/already linked/);
 await db.exec('reset role');const events=(await db.query('select event,status from private.patient_invitation_events')).rows;
 assert(events.some(e=>e.status==='revoked'));assert(events.some(e=>e.status==='accepted'));
 assert.equal(events.filter(e=>e.event==='attempt').length,3);
 await db.exec('set role anon');await assert.rejects(db.query('select * from private.patient_invitation_events'),/permission denied/);
 } finally {await db.close();}
});
