import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
const token='a'.repeat(64),patient='20000000-0000-0000-0000-000000000001',uid='30000000-0000-0000-0000-000000000001';
function handler(state={}) {
 const calls=[];
 const client={rpc:async(name,args)=>{
  calls.push({name,args});
  if(state.denied)return {error:{message:token}};
  if(name==='manage_patient_password_reset')return {data:{token,status:'pending'}};
  return {data:{userId:uid,unconfirmed:state.unconfirmed??true}};
 },auth:{getUser:async()=>state.unauthorized?{error:{}}:{data:{user:{id:'clinician'}}},admin:{updateUserById:async(id,args)=>{calls.push({name:'updateUser',id,args});return state.updateFailed?{error:{message:token}}:{data:{user:{id}}};}}}};
 const m=new Module('reset');m.require=name=>({'@supabase/supabase-js':{createClient:()=>client},'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},'@/lib/app-url':{getAppRoute:()=> 'https://example.invalid/recover'}})[name];
 m._compile(ts.transpileModule(fs.readFileSync('app/api/patient-invitations/password-reset/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'reset');
 return {POST:m.exports.POST,calls};
}
const req=(body,auth=false)=>({headers:new Headers(auth?{Authorization:'Bearer synthetic'}:{}),text:async()=>JSON.stringify(body)});
test('recovery gates clinician issuance and consumes a scoped one-use token before any password mutation',async()=>{
 const saved={...process.env};
 try{
  Object.assign(process.env,{PATIENT_INVITE_LINK_ONLY_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:'synthetic'});
  let h=handler();assert.equal((await h.POST(req({action:'issue',patientId:patient}))).status,401);assert.equal(h.calls.length,0);
  h=handler({unauthorized:true});assert.equal((await h.POST(req({action:'issue',patientId:patient},true))).status,401);assert.equal(h.calls.length,0);
  h=handler({denied:true});let r=await h.POST(req({action:'issue',patientId:patient},true));assert.equal(r.status,409);assert(!JSON.stringify(r).includes(token));
  h=handler();r=await h.POST(req({action:'issue',patientId:patient},true));assert.equal(r.status,200);assert.equal(r.body.link,'https://example.invalid/recover#token='+token);assert.equal(r.headers['Cache-Control'],'no-store');
  const body={action:'reset',token,email:'patient@example.invalid',password:'NewSyntheticPassword!2026'};
  h=handler();assert.equal((await h.POST(req({...body,password:'short'}))).status,400);assert.equal(h.calls.length,0);
  h=handler({denied:true});assert.equal((await h.POST(req(body))).status,409);assert(!h.calls.some(c=>c.name==='updateUser'));
  h=handler();r=await h.POST(req(body));assert.equal(r.status,200);assert.deepEqual(h.calls.map(c=>c.name),['consume_patient_password_reset','updateUser']);assert.equal(h.calls[1].id,uid);assert.equal(h.calls[1].args.password,body.password);assert.equal(h.calls[1].args.email_confirm,true);assert.equal(h.calls[1].args.app_metadata.email_ownership_verified,false);
  h=handler({unconfirmed:false});assert.equal((await h.POST(req(body))).status,200);assert.deepEqual(Object.keys(h.calls[1].args),['password'],'established mailbox assurance is preserved');
  h=handler({updateFailed:true});r=await h.POST(req(body));assert.equal(r.status,503);assert(!JSON.stringify(r).includes(token));assert(r.body.error.includes('now used'));
  process.env.PATIENT_INVITE_LINK_ONLY_ENABLED='false';h=handler();assert.equal((await h.POST(req(body))).status,503);assert.equal(h.calls.length,0);
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
