import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('clinician recovery preserves identity and records, revokes stale tokens, and excludes unrelated or privileged accounts',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const owner='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
 const pid='20000000-0000-0000-0000-000000000001',uid='30000000-0000-0000-0000-000000000001';
 const email='synthetic@example.invalid';
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;create schema extensions;create extension pgcrypto schema extensions;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,last_sign_in_at timestamptz,phone_confirmed_at timestamptz,is_sso_user boolean,is_anonymous boolean,banned_until timestamptz,raw_user_meta_data jsonb);
 create table auth.sessions(user_id uuid);create table auth.identities(user_id uuid,provider text);create table auth.mfa_factors(user_id uuid);
 create table profiles(id uuid primary key,role text,email text);
 create table patients(id uuid primary key,clinician_id uuid,patient_profile_id uuid,patient_invite_token_hash text,patient_invite_expires_at timestamptz,updated_at timestamptz);
 grant usage on schema auth,private to authenticated;grant execute on function auth.uid() to authenticated;
 insert into patients(id,clinician_id) values('${pid}','${owner}');`);
 for(const name of ['20261010220722_secure_patient_invitation_replacement.sql','20261016221136_sms_patient_invitations.sql','20261016221539_finalize_copy_invitation_atomically.sql','20261017221349_pilot_link_only_signup.sql','20261018005743_recover_incomplete_pilot_registration.sql','20261018013008_patient_password_recovery_links.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const actor=async(id=owner,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 const issueInvite=async()=>{
  await db.exec("reset role;update private.patient_email_invitations set attempted_at=now()-interval '3 minutes'");await actor();
  const inv=(await db.query("select manage_patient_delivery($1,$2,'','copy','replace',false) result",[pid,email])).rows[0].result;
  await actor(owner,'service_role');await db.query('select enable_patient_pilot_signup($1,$2)',[inv.token,owner]);return inv.token;
 };
 const issue=async()=>{await db.exec("reset role;update private.patient_password_resets set issued_at=now()-interval '3 minutes'");await actor();return(await db.query("select manage_patient_password_reset($1,'issue') result",[pid])).rows[0].result.token;};
 const consume=async(token,address=email)=>{await actor(owner,'service_role');return(await db.query('select consume_patient_password_reset($1,$2) result',[token,address])).rows[0].result;};
 let invite=await issueInvite();await assert.rejects(issue(),/not eligible/);
 await db.exec(`reset role;insert into auth.users(id,email) values('${uid}','${email}');`);
 await actor(other);await assert.rejects(db.query("select manage_patient_password_reset($1,'issue')",[pid]),/unavailable/);
 await actor(owner,'anon');await assert.rejects(db.query("select manage_patient_password_reset($1,'issue')",[pid]),/permission denied/);
 let token=await issue();assert.match(token,/^[a-f0-9]{64}$/);
 await actor();await assert.rejects(db.query('select consume_patient_password_reset($1,$2)',[token,email]),/permission denied/);
 await assert.rejects(consume(token,'wrong@example.invalid'),/unavailable/);
 assert.equal((await consume(token)).userId,uid);await assert.rejects(consume(token),/unavailable/);
 token=await issue();await db.exec("reset role;update private.patient_password_resets set expires_at=now()-interval '1 second'");await assert.rejects(consume(token),/unavailable/);
 token=await issue();await actor();await db.query("select manage_patient_email_invitation($1,'','revoke')",[pid]);await assert.rejects(consume(token),/unavailable/);
 await assert.rejects(issue(),/current pilot invitation/);
 invite=await issueInvite();token=await issue();const previous=token;invite=await issueInvite();await assert.rejects(consume(previous),/unavailable/,'regeneration invalidates recovery');
 token=await issue();await actor();await db.query("select manage_patient_password_reset($1,'revoke')",[pid]);await assert.rejects(consume(token),/unavailable/);
 // An unrelated confirmed account must fail closed even with NULL prior bindings.
 await db.exec(`reset role;delete from private.patient_password_resets;update auth.users set email_confirmed_at=now(),last_sign_in_at=now() where id='${uid}';`);
 await assert.rejects(issue(),/not eligible/);
 await db.exec(`reset role;update auth.users set email_confirmed_at=null,last_sign_in_at=null where id='${uid}';`);
 token=await issue();await db.exec(`reset role;insert into auth.mfa_factors values('${uid}');`);await assert.rejects(consume(token),/unavailable/);
 await assert.rejects(issue(),/not eligible/);await db.exec('reset role;delete from auth.mfa_factors');
 await db.exec(`update profiles set role='clinician' where id='${uid}'`);await assert.rejects(issue(),/not eligible/);await db.exec(`reset role;update profiles set role='patient' where id='${uid}'`);
 token=await issue();assert.equal((await consume(token)).unconfirmed,true);
 // Simulate the successful Auth password update. A fresh invitation can reuse
 // this email through ordinary authenticated claim, retaining the same UUID.
 await db.exec(`reset role;update auth.users set email_confirmed_at=now(),last_sign_in_at=now() where id='${uid}';`);
 invite=await issueInvite();await actor(uid);assert.equal((await db.query('select private.claim_patient_invite($1) id',[invite])).rows[0].id,pid);
 token=await issue();assert.equal((await consume(token)).userId,uid,'linked patient recovery works');
 token=await issue();await db.exec(`reset role;update patients set clinician_id='${other}' where id='${pid}'`);await assert.rejects(consume(token),/unavailable/,'ownership changes invalidate reset authorization');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,1);assert.equal((await db.query('select patient_profile_id from patients')).rows[0].patient_profile_id,uid);
 }finally{await db.close();}
});
