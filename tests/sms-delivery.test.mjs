import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
import twilio from 'twilio';

function load(path,deps){const m=new Module(path);m.require=n=>deps[n]??(n==='twilio'?twilio:undefined);m._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,path);return m.exports;}
const original={...process.env};
const response={json:(body,init={})=>({body,status:init.status??200})};
const patientId='20000000-0000-0000-0000-000000000001';
test('delivery checks auth, consent, ownership, provider failures, and copy never sends',async()=>{
 let sent=0,issue=0,finish; let owner=true,throws=false,cooldown=false;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic';process.env.SUPABASE_SECRET_KEY='synthetic';process.env.PATIENT_SMS_REAL_DELIVERY_APPROVED='true';
 const client={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:owner?{id:patientId}:null})}),rpc:async(n,a)=>{
 if(n==='manage_patient_delivery'){issue++;return cooldown?{error:{message:'Wait'}}:{data:{token:'a'.repeat(64),attemptId:patientId}};}
 if(n==='finish_patient_email_invitation')finish=a.p_success;
 return {data:true};}};
 const sms={normalizeMobile:v=>{if(!v.startsWith('+'))throw Error();return v;},smsConfiguration:()=>({}),sendSms:async()=>{sent++;if(throws)throw Error('sensitive');return {sid:'SM'+'a'.repeat(32),status:'queued'};}};
 const {POST}=load('app/api/patient-invitations/delivery/route.ts',{'next/server':{NextResponse:response},'@supabase/supabase-js':{createClient:()=>client},'@/lib/app-url':{getAppRoute:p=>'https://example.invalid'+p},'@/lib/sms':sms});
 const req=(b={},auth=true)=>({headers:new Headers(auth?{authorization:'Bearer synthetic'}:{}),json:async()=>({patientId,email:'patient@example.invalid',method:'sms',mobile:'+12025550123',consent:true,...b})});
 try{
 assert.equal((await POST(req({},false))).status,401);assert.equal((await POST(req({consent:false}))).status,400);
 owner=false;assert.equal((await POST(req())).status,403);assert.equal(issue,0);owner=true;
 assert.equal((await POST(req())).status,200);assert.equal(sent,1);assert.equal(finish,true);
 throws=true;assert.equal((await POST(req())).status,503);assert.equal(finish,false);
 const copy=await POST(req({method:'copy'}));assert.equal(copy.status,200);assert(copy.body.link.includes('#token='));assert.equal(sent,2);
 cooldown=true;assert.equal((await POST(req())).status,429);assert.equal(sent,2);
 }finally{for(const n of Object.keys(process.env))if(!(n in original))delete process.env[n];Object.assign(process.env,original);}
});

test('webhook verifies exact external URL signature and rejects forged callbacks',async()=>{
 const auth='synthetic-auth',account='AC'+'b'.repeat(32),sid='SM'+'a'.repeat(32);let calls=0;
 process.env.TWILIO_AUTH_TOKEN=auth;process.env.TWILIO_ACCOUNT_SID=account;process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SECRET_KEY='synthetic';
 class NextResponse{constructor(body,init){this.status=init.status;}}
 const {POST}=load('app/api/patient-invitations/sms-status/route.ts',{'next/server':{NextResponse},'@supabase/supabase-js':{createClient:()=>({rpc:async()=>{calls++;return {};}})},'@/lib/app-url':{getAppRoute:p=>'https://example.invalid'+p}});
 const url='https://example.invalid/api/patient-invitations/sms-status?attempt='+patientId;
 const params={AccountSid:account,MessageSid:sid,MessageStatus:'delivered'};
 const req=sig=>({headers:new Headers({'x-twilio-signature':sig}),nextUrl:new URL(url),text:async()=>new URLSearchParams(params).toString()});
 try{assert.equal((await POST(req('forged'))).status,403);assert.equal(calls,0);assert.equal((await POST(req(twilio.getExpectedTwilioSignature(auth,url,params)))).status,204);assert.equal(calls,1);}
 finally{for(const n of Object.keys(process.env))if(!(n in original))delete process.env[n];Object.assign(process.env,original);}
});
