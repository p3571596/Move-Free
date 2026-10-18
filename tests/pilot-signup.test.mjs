import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

const errorsModule=new Module('auth-errors');
errorsModule._compile(ts.transpileModule(fs.readFileSync('lib/auth-errors.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'auth-errors');
const token='a'.repeat(64),patient='20000000-0000-0000-0000-000000000001';
function handler(state) {
 const calls=[];
 const client={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='reserve_patient_pilot_signup')return state.reserveError?{error:{message:'secret token'}}:{data:{patientId:patient,...(state.resume?{userId:"30000000-0000-0000-0000-000000000009",resumeExisting:true}:{})}};
  if(name==='complete_patient_pilot_signup')return state.finishError?{error:{message:token}}:{data:patient};
  if(name==='cancel_patient_pilot_signup')return {data:state.safeToDelete??true};
  throw Error(name);
 },auth:{signInWithPassword:async args=>{calls.push({name:'passwordProof',args});return {error:{code:state.passwordCode??'email_not_confirmed'}};},admin:{updateUserById:async(id,args)=>{calls.push({name:'updateUserById',id,args});assert(!('password' in args));return {data:{user:{id}}};},createUser:async args=>{
  calls.push({name:'createUser',args});
  assert.equal(args.email_confirm,true);assert.equal(args.app_metadata.email_ownership_verified,false);
  return state.createError?{error:{message:'existing account',code:state.errorCode}}:{data:{user:{id:args.id}}};
 },deleteUser:async id=>{calls.push({name:'deleteUser',id});return {};}}}};
 const m=new Module('pilot-signup');m.require=name=>({'node:crypto':{randomUUID},'@supabase/supabase-js':{createClient:()=>client},'@/lib/auth-errors':errorsModule.exports,'next/server':{NextResponse:{json:(body,options)=>({body,...options})}}})[name];
 m._compile(ts.transpileModule(fs.readFileSync('app/api/patient-invitations/pilot-signup/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'pilot-signup');
 return {POST:m.exports.POST,calls};
}
const request=extra=>({headers:new Headers(),text:async()=>JSON.stringify({token,email:'new@example.invalid',password:'SyntheticPassword!2026',...extra})});
test('pilot signup creates fresh accounts or resumes password-proven incomplete registrations without replacing passwords',async()=>{
 const saved={...process.env};
 try {
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SECRET_KEY='synthetic';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='public';
  delete process.env.PATIENT_INVITE_LINK_ONLY_ENABLED;
  let h=handler({});assert.equal((await h.POST(request())).status,503);assert.equal(h.calls.length,0);
  process.env.PATIENT_INVITE_LINK_ONLY_ENABLED='true';
  assert.equal((await h.POST(request({password:''}))).status,400);assert.equal(h.calls.length,0);
  h=handler({reserveError:true});assert.equal((await h.POST(request())).status,409);assert.equal(h.calls.filter(c=>c.name==='createUser').length,0);
  h=handler({createError:true,errorCode:'email_exists'});assert.equal((await h.POST(request())).status,409);assert.equal(h.calls.filter(c=>c.name==='deleteUser').length,0);assert(h.calls.some(c=>c.name==='cancel_patient_pilot_signup'));
  h=handler({finishError:true});let response=await h.POST(request());assert.equal(response.status,409);assert.equal(h.calls.filter(c=>c.name==='deleteUser').length,1);assert(!JSON.stringify(response).includes(token));
  h=handler({finishError:true,safeToDelete:false});assert.equal((await h.POST(request())).status,409);assert.equal(h.calls.filter(c=>c.name==='deleteUser').length,0);
  h=handler({});response=await h.POST(request());assert.equal(response.status,200);assert.deepEqual(response.body,{created:true});assert.equal(h.calls.filter(c=>c.name==='deleteUser').length,0);assert.equal(response.headers['Cache-Control'],'no-store');
  assert(!h.calls.some(c=>/updateUser|inviteUser|signUp|generateLink/.test(c.name)));
  for (const code of ['invalid_credentials','request_timeout',null]) {
    h=handler({resume:true,passwordCode:code??'unknown'});response=await h.POST(request());assert.equal(response.status,code==='invalid_credentials'?409:503);
    assert(!h.calls.some(c=>c.name==='updateUserById'||c.name==='createUser'||c.name==='deleteUser'));
  }
  h=handler({createError:true,errorCode:'weak_password'});response=await h.POST(request());assert.equal(response.status,422);assert.equal(response.body.code,'weak_password');assert(response.body.error.includes('weak or easy to guess'));
  h=handler({resume:true});assert.equal((await h.POST(request({password:'oldPass8'}))).status,200);
  h=handler({});assert.equal((await h.POST(request({password:'oldPass8'}))).status,400);assert(!h.calls.some(c=>c.name==='createUser'));
  h=handler({resume:true});response=await h.POST(request());assert.equal(response.status,200);
  assert(h.calls.some(c=>c.name==='passwordProof'));assert(h.calls.some(c=>c.name==='updateUserById'));
  assert(!h.calls.some(c=>c.name==='createUser'||c.name==='deleteUser'));
  h=handler({resume:true,finishError:true});response=await h.POST(request());assert.equal(response.status,409);
  assert(!h.calls.some(c=>c.name==='deleteUser'),'resumed accounts are never deleted after failure');
 } finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
