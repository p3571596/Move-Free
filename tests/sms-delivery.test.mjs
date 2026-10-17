import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';

function load(path,deps){const m=new Module(path);m.require=n=>deps[n];m._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,path);return m.exports;}
const original={...process.env};
const response={json:(body,init={})=>({body,status:init.status??200})};
const patientId='20000000-0000-0000-0000-000000000001';
test('manual links require ownership and work without SMTP or provider credentials',async()=>{
 let issue=0,owner=true,linked=false,cooldown=false;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic';delete process.env.SUPABASE_SECRET_KEY;
 const client={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:owner?{id:patientId,patient_profile_id:linked?'linked':null}:null})}),rpc:async(n,a)=>{
 assert.equal(n,'manage_patient_delivery');assert.equal(a.p_method,'copy');assert.equal(a.p_mobile,'');issue++;
 return cooldown?{error:{message:'Wait'}}:{data:{token:'a'.repeat(64),attemptId:patientId}};}};
 const {POST}=load('app/api/patient-invitations/delivery/route.ts',{'next/server':{NextResponse:response},'@supabase/supabase-js':{createClient:()=>client},'@/lib/app-url':{getAppRoute:p=>'https://example.invalid'+p}});
 const req=(b={},auth=true)=>({headers:new Headers(auth?{authorization:'Bearer synthetic'}:{}),json:async()=>({patientId,email:'patient@example.invalid',method:'copy',...b})});
 try{
 assert.equal((await POST(req({},false))).status,401);
 assert.equal((await POST(req({method:'sms'}))).status,400);assert.equal(issue,0);
 owner=false;assert.equal((await POST(req())).status,403);assert.equal(issue,0);owner=true;
 linked=true;assert.equal((await POST(req())).status,409);linked=false;
 const copy=await POST(req());assert.equal(copy.status,200);assert(copy.body.link.includes('/join#token='));assert.equal(copy.body.status,'pending');
 cooldown=true;assert.equal((await POST(req())).status,429);
 }finally{for(const n of Object.keys(process.env))if(!(n in original))delete process.env[n];Object.assign(process.env,original);}
});
