import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_pilot_link_only_signup.sql'));

test('pilot signup explicitly opts in and binds only a fresh reserved account; leases, revocation and single use fail closed',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const owner='10000000-0000-0000-0000-000000000001',wrong='10000000-0000-0000-0000-000000000002',pid='20000000-0000-0000-0000-000000000001';
 const user='30000000-0000-0000-0000-000000000001',other='30000000-0000-0000-0000-000000000002',lease='40000000-0000-0000-0000-000000000001',lease2='40000000-0000-0000-0000-000000000002';
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;create schema extensions;create extension pgcrypto schema extensions;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,last_sign_in_at timestamptz,phone_confirmed_at timestamptz,is_sso_user boolean,is_anonymous boolean,banned_until timestamptz,raw_user_meta_data jsonb);
 create table auth.sessions(user_id uuid);create table auth.identities(user_id uuid,provider text);create table auth.mfa_factors(user_id uuid);
 create table profiles(id uuid primary key,role text,email text);
 create table patients(id uuid primary key,clinician_id uuid,patient_profile_id uuid,patient_invite_token_hash text,patient_invite_expires_at timestamptz,updated_at timestamptz);
 grant usage on schema auth,private to authenticated;grant execute on function auth.uid() to authenticated;
 insert into patients(id,clinician_id) values('${pid}','${owner}');`);
 for(const name of ['20261010220722_secure_patient_invitation_replacement.sql','20261016221136_sms_patient_invitations.sql','20261016221539_finalize_copy_invitation_atomically.sql',migration,'20261018005743_recover_incomplete_pilot_registration.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const actor=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 const service=()=>actor(owner,'service_role');
 const issue=async()=>{await db.exec("reset role;update private.patient_email_invitations set attempted_at=now()-interval '3 minutes'");await actor(owner);return(await db.query("select manage_patient_delivery($1,'original@example.invalid','','copy','replace',false) result",[pid])).rows[0].result;};
 const enable=async(token,clinician=owner)=>{await service();return db.query('select enable_patient_pilot_signup($1,$2)',[token,clinician]);};
 let reserveEmail='new@example.invalid';
 const reserve=async(token,u=user,l=lease)=>{await service();return db.query("select reserve_patient_pilot_signup($1,$2,$3,$4) result",[token,u,l,reserveEmail]);};
 const complete=async(token,u=user,l=lease)=>{await service();return db.query('select complete_patient_pilot_signup($1,$2,$3) id',[token,u,l]);};
 const cancel=async(u=user,l=lease)=>{await service();return(await db.query('select cancel_patient_pilot_signup($1,$2,$3) safe',[pid,u,l])).rows[0].safe;};
 let invitation=await issue();
 await assert.rejects(reserve(invitation.token),/unavailable/,'fragment mode cannot enable a verified invitation');
 await assert.rejects(enable(invitation.token,wrong),/unavailable/);
 await actor(owner);await assert.rejects(db.query('select enable_patient_pilot_signup($1,$2)',[invitation.token,owner]),/permission denied/);
 await actor(owner,'anon');await assert.rejects(db.query("select reserve_patient_pilot_signup($1,$2,$3,'new@example.invalid')",[invitation.token,user,lease]),/permission denied/);
 await enable(invitation.token);await reserve(invitation.token);
 await assert.rejects(reserve(invitation.token,other,lease2),/in progress/,'second holder cannot race the reserved account');
 await db.exec(`reset role;insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values('${user}','new@example.invalid',now(),'{"signup_assurance":"invitation_link_only","email_ownership_verified":false}');`);
 await assert.rejects(complete(invitation.token,other,lease2),/unavailable/);
 await actor(owner);await db.query("select manage_patient_email_invitation($1,'','revoke')",[pid]);
 await assert.rejects(complete(invitation.token),/unavailable/);assert.equal(await cancel(),true);
 await db.exec('reset role;delete from auth.users');
 invitation=await issue();await assert.rejects(reserve(invitation.token),/unavailable/,'regeneration resets opt-in');
 await enable(invitation.token);await reserve(invitation.token);
 await db.exec("reset role;update private.patient_email_invitations set expires_at=now()-interval '1 second'");
 await assert.rejects(complete(invitation.token),/unavailable/);assert.equal(await cancel(),true);
 invitation=await issue();await enable(invitation.token);await reserve(invitation.token);
 await db.exec(`reset role;insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values('${user}','new@example.invalid',now(),'{"signup_assurance":"invitation_link_only","email_ownership_verified":false}');insert into profiles values('${user}','clinician','new@example.invalid');`);
 await assert.rejects(complete(invitation.token),/not eligible/,'privileged accounts never become patients');
 await db.exec(`reset role;update profiles set role='patient' where id='${user}';`);
 assert.equal((await complete(invitation.token)).rows[0].id,pid);
 await assert.rejects(complete(invitation.token),/unavailable/,'single use');
 assert.equal(await cancel(),false,'uncertain success must never permit deletion of linked account');
 await db.exec('reset role');
 assert.equal((await db.query('select token_hash from private.patient_email_invitations')).rows[0].token_hash,null);
 assert.equal((await db.query("select count(*)::int n from private.patient_invitation_events where event='signup_link_only'")).rows[0].n,1);
 const p2='20000000-0000-0000-0000-000000000002',u2='30000000-0000-0000-0000-000000000002',u3='30000000-0000-0000-0000-000000000003';
 await db.exec(`reset role;insert into patients(id,clinician_id) values('${p2}','${owner}');`);
 await actor(owner);const second=(await db.query("select manage_patient_delivery($1,'other@example.invalid','','copy','send',false) result",[p2])).rows[0].result;
 reserveEmail='other@example.invalid';
 await enable(second.token);await reserve(second.token,u2,lease);
 await db.exec("reset role;update private.patient_email_invitations set signup_reserved_at=now()-interval '3 minutes' where patient_id='"+p2+"'");
 await reserve(second.token,u3,lease2);
 await assert.rejects(complete(second.token,u2,lease),/unavailable/,'expired lease cannot complete after replacement');
 await service();await db.query('select cancel_patient_pilot_signup($1,$2,$3)',[p2,u2,lease]);
 await assert.rejects(reserve(second.token,u2,lease),/in progress/,'stale cleanup cannot clear the replacement lease');
 await service();await db.query('select cancel_patient_pilot_signup($1,$2,$3)',[p2,u3,lease2]);
 for(let attempt=0;attempt<3;attempt++) {await reserve(second.token,u2,lease);await service();await db.query('select cancel_patient_pilot_signup($1,$2,$3)',[p2,u2,lease]);}
 await assert.rejects(reserve(second.token,u2,lease),/unavailable/,'five signup attempts require a new invitation');


 // Abandoned signup can only reserve its exact identity; established accounts
 // and every privileged/linked/session-backed identity remain protected.
 await db.exec(`reset role;update private.patient_email_invitations set signup_failures=0 where patient_id='${p2}';
 insert into auth.users(id,email) values('${u2}','other@example.invalid');`);
 assert.equal((await reserve(second.token,u3,lease)).rows[0].result.userId,u2);
 await service();assert.equal((await db.query('select cancel_patient_pilot_signup($1,$2,$3) safe',[p2,u2,lease])).rows[0].safe,true);
 for(const statement of [
  `update auth.users set email_confirmed_at=now() where id='${u2}'`,
  `update auth.users set last_sign_in_at=now() where id='${u2}'`,
  `update auth.users set raw_app_meta_data='{"role":"clinician"}' where id='${u2}'`,
  `insert into auth.sessions values('${u2}')`,
  `insert into auth.identities values('${u2}','google')`,
  `insert into auth.mfa_factors values('${u2}')`,
  `insert into profiles values('${u2}','clinician','new@example.invalid')`,
  `update patients set clinician_id='${u2}' where id='${p2}'`,
 ]) {
  await db.exec('reset role;'+statement);
  await assert.rejects(reserve(second.token,u3,lease),/must sign in/);
  await db.exec(`reset role;update auth.users set email_confirmed_at=null,last_sign_in_at=null,raw_app_meta_data=null where id='${u2}';
   delete from auth.sessions;delete from auth.identities;delete from auth.mfa_factors;delete from profiles where id='${u2}';
   update patients set clinician_id='${owner}' where id='${p2}';`);
 }

 }finally{await db.close();}
});
