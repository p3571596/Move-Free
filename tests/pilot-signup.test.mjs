import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

const token='a'.repeat(64),patient='20000000-0000-0000-0000-000000000001';
function handler(state) {
 const calls=[];
 const client={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='reserve_patient_pilot_signup')return state.reserveError?{error:{message:'secret token'}}:{data:{patientId:patient}};
  if(name==='complete_patient_pilot_signup')return state.finishError?{error:{message:token}}:{data:patient};
  if(name==='cancel_patient_pilot_signup')return {data:state.safeToDelete??true};
  throw Error(name);
 },auth:{admin:{createUser:async args=>{
  calls.push({name:'createUser',args});
  assert.equal(args.email_confirm,true);assert.equal(args.app_metadata.email_ownership_verified,false);
  return state.createError?{error:{message:'existing account'}}:{data:{user:{id:args.id}}};
 },deleteUser:async id=>{calls.push({name:'deleteUser',id});return {};}}}};
 const m=new Module('pilot-signup');m.require=name=>({'node:crypto':{randomUUID},'@supabase/supabase-js':{createClient:()=>client},'next/server':{NextResponse:{json:(body,options)=>({body,...options})}}})[name];
 m._compile(ts.transpileModule(fs.readFileSync('app/api/patient-invitations/pilot-signup/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'pilot-signup');
 return {POST:m.exports.POST,calls};
}
const request=extra=>({headers:new Headers(),text:async()=>JSON.stringify({token,email:'new@example.invalid',password:'SyntheticPassword!2026',...extra})});
test('pilot signup is explicit, creates only fresh accounts, and never deletes a linked account after uncertain completion',async()=>{
 const saved={...process.env};
 try {
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SECRET_KEY='synthetic';
  delete process.env.PATIENT_INVITE_LINK_ONLY_ENABLED;
  let h=handler({});assert.equal((await h.POST(request())).status,503);assert.equal(h.calls.length,0);
  process.env.PATIENT_INVITE_LINK_ONLY_ENABLED='true';
  assert.equal((await h.POST(request({password:'short'}))).status,400);assert.equal(h.calls.length,0);
  h=handler({reserveError:true});assert.equal((await h.POST(request())).status,409);assert.equal(h.calls.filter(c=>c.name==='createUser').length,0);
  h=handler({createError:true});assert.equal((await h.POST(request())).status,409);assert.equal(h.calls.filter(c=>c.name==='deleteUser').length,0);assert(h.calls.some(c=>c.name==='cancel_patient_pilot_signup'));
  h=handler({finishError:true});let response=await h.POST(request());assert.equal(response.status,409);assert.equal(h.calls.filter(c=>c.name==='deleteUser').length,1);assert(!JSON.stringify(response).includes(token));
  h=handler({finishError:true,safeToDelete:false});assert.equal((await h.POST(request())).status,409);assert.equal(h.calls.filter(c=>c.name==='deleteUser').length,0);
  h=handler({});response=await h.POST(request());assert.equal(response.status,200);assert.deepEqual(response.body,{created:true});assert.equal(h.calls.filter(c=>c.name==='deleteUser').length,0);assert.equal(response.headers['Cache-Control'],'no-store');
  assert(!h.calls.some(c=>/updateUser|inviteUser|signUp|generateLink/.test(c.name)));
 } finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
