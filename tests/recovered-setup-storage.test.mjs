import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('recovered setup requires authenticated clinician-bound proof, consumes the current invitation and rejects stale or ambiguous associations',async()=>{
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
 for(const name of ['20261010220722_secure_patient_invitation_replacement.sql','20261016221136_sms_patient_invitations.sql','20261016221539_finalize_copy_invitation_atomically.sql','20261017221349_pilot_link_only_signup.sql','20261018005743_recover_incomplete_pilot_registration.sql','20261018013008_patient_password_recovery_links.sql','20261018122726_finish_recovered_patient_setup.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const actor=async(id=uid,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 const finish=async(id=uid)=>{await actor(id);return(await db.query('select finish_recovered_patient_setup() id')).rows[0].id;};
 await db.exec(`insert into auth.users(id,email) values('${uid}','${email}');insert into profiles values('${uid}','patient','${email}');`);
 await actor(owner);const invitation=(await db.query("select manage_patient_delivery($1,$2,'','copy','send',false) result",[pid,email])).rows[0].result;
 await actor(owner,'service_role');await db.query('select enable_patient_pilot_signup($1,$2)',[invitation.token,owner]);
 await actor(uid,'anon');await assert.rejects(db.query('select finish_recovered_patient_setup()'),/permission denied/);
 await actor();await assert.rejects(db.query('select private.can_finish_recovered_patient_setup($1,$2)',[pid,uid]),/permission denied/);
 await db.exec(`reset role;update auth.users set email_confirmed_at=now(),last_sign_in_at=now(),raw_app_meta_data='{"signup_assurance":"clinician_recovery_link","email_ownership_verified":false}' where id='${uid}'`);
 await assert.rejects(finish(),/No single/,'email and account metadata alone are insufficient');
 await db.exec(`reset role;update auth.users set email_confirmed_at=null,last_sign_in_at=null,raw_app_meta_data=null where id='${uid}'`);
 await actor(owner);const reset=(await db.query("select manage_patient_password_reset($1,'issue') result",[pid])).rows[0].result;
 await actor(owner,'service_role');await db.query('select consume_patient_password_reset($1,$2)',[reset.token,email]);
 await assert.rejects(finish(),/No single/,'consumed token without successful Auth update cannot authorize setup');
 await db.exec(`reset role;update auth.users set email_confirmed_at=now(),last_sign_in_at=now(),raw_app_meta_data='{"signup_assurance":"clinician_recovery_link","email_ownership_verified":false}' where id='${uid}'`);
 await assert.rejects(finish(other),/No single/,'another login cannot claim this recovered account');
 const invalidations=[
  [`update private.patient_email_invitations set status='revoked'`,`update private.patient_email_invitations set status='pending'`],
  [`update private.patient_email_invitations set expires_at=now()-interval '1 second'`,`update private.patient_email_invitations set expires_at=now()+interval '7 days'`],
  [`update private.patient_email_invitations set attempted_at=now()+interval '1 second'`,`update private.patient_email_invitations set attempted_at=now()-interval '1 minute'`],
  [`update private.patient_password_resets set clinician_id='${other}'`,`update private.patient_password_resets set clinician_id='${owner}'`],
  [`update patients set clinician_id='${other}'`,`update patients set clinician_id='${owner}'`],
  [`update private.patient_password_resets set consumed_at=null`,`update private.patient_password_resets set consumed_at=now()`],
  [`update auth.users set email='other@example.invalid'`,`update auth.users set email='${email}'`],
  [`update auth.users set raw_app_meta_data=null`,`update auth.users set raw_app_meta_data='{"signup_assurance":"clinician_recovery_link","email_ownership_verified":false}'`],
  [`update profiles set role='clinician'`,`update profiles set role='patient'`],
  [`update private.patient_email_invitations set link_only_signup=false`,`update private.patient_email_invitations set link_only_signup=true`],
 ];
 for(const [invalidate,restore] of invalidations){await db.exec('reset role;'+invalidate);await assert.rejects(finish(),/No single/);await db.exec('reset role;'+restore);}
 const p2='20000000-0000-0000-0000-000000000002';
 await db.exec(`reset role;insert into patients(id,clinician_id) values('${p2}','${owner}');
 insert into private.patient_email_invitations(patient_id,recipient,token_hash,attempt_id,status,attempted_at,expires_at,link_only_signup)
 select '${p2}',recipient,encode(extensions.digest('another-token','sha256'),'hex'),gen_random_uuid(),'pending',now()-interval '1 day',expires_at,true from private.patient_email_invitations where patient_id='${pid}';
 insert into private.patient_password_resets(patient_id,user_id,clinician_id,email,issued_at,expires_at,consumed_at)
 select '${p2}',user_id,clinician_id,email,issued_at,expires_at,consumed_at from private.patient_password_resets where patient_id='${pid}';`);
 await assert.rejects(finish(),/No single/,'multiple recovered invitations require clinician review');
 await db.exec(`reset role;delete from patients where id='${p2}';update private.patient_password_resets set expires_at=now()-interval '1 second'`);
 assert.equal(await finish(),pid,'completed recovery remains proof after reset-link expiry while invitation is valid');
 await assert.rejects(finish(),/already linked/);
 await db.exec('reset role');assert.equal((await db.query('select patient_profile_id from patients')).rows[0].patient_profile_id,uid);
 const state=(await db.query('select status,token_hash from private.patient_email_invitations')).rows[0];assert.equal(state.status,'accepted');assert.equal(state.token_hash,null);
 assert.equal((await db.query("select count(*)::int n from private.patient_invitation_events where event='accepted_after_clinician_recovery'")).rows[0].n,1);
 }finally{await db.close();}
});
