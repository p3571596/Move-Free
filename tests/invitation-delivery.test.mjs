import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';

function setup({inviteError=null,otpError=null,role='patient',linked=false,finish=true,throws=false,cooldown=false}={}) {
 const calls=[];
 const query=(data)=>({select(){return this},eq(){return this},limit(){return this},maybeSingle:async()=>({data,error:null})});
 const authClient={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>query({id:'patient',patient_profile_id:linked?'linked':null}),rpc:async(name,args)=>{calls.push([name,args]);return cooldown?{error:{message:'Wait 60 seconds'}}:{data:{token:'synthetic-token-not-real',attemptId:'attempt'}};}};
 const admin={auth:{admin:{
  getUserById:async()=>({data:{user:{email:'synthetic@example.invalid'}}}),
  inviteUserByEmail:async()=>{calls.push(['invite']);if(throws)throw Error('sensitive provider detail');return {error:inviteError}},
  listUsers:async()=>({data:{users:[{id:'existing',email:'synthetic@example.invalid',app_metadata:{}}]}}),
  updateUserById:async()=>({error:null}),
 }},from:table=>query(table==='profiles'?{role}:null),rpc:async(name,args)=>{calls.push([name,args]);return {data:finish,error:null};}};
 const otp={auth:{signInWithOtp:async(args)=>{calls.push(['otp',args.options.shouldCreateUser]);return {error:otpError};}}};
 let count=0;
 const dependencies={'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},'@/lib/app-url':{getAppRoute:path=>'https://example.invalid'+path},'@supabase/supabase-js':{createClient:()=>[authClient,admin,otp][count++]}};
 const mod=new Module('delivery');mod.require=name=>dependencies[name];
 mod._compile(ts.transpileModule(fs.readFileSync('app/api/patient-invitations/email/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'delivery');
 return {post:mod.exports.POST,calls};
}
const request=action=>({headers:new Headers({authorization:'Bearer synthetic'}),json:async()=>({patientId:'patient',email:'synthetic@example.invalid',action})});

test('delivery API treats provider acceptance, SMTP failure, rate limits, and existing accounts correctly',async()=>{
 const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'];const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
 const original={info:console.info,warn:console.warn,error:console.error};const logs=[];for(const name of Object.keys(original))console[name]=value=>logs.push(value);
 try {
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic';process.env.SUPABASE_SECRET_KEY='synthetic-secret';
  for(const [config,expected,success,mode] of [
   [{},200,true,'invite'],
   [{inviteError:{message:'535 Authentication credentials invalid smtp sensitive@example.invalid',status:500}},503,false],
   [{inviteError:{message:'rate limit',status:429}},429,false],
   [{inviteError:{message:'already registered',code:'email_exists'}},200,true,'resume'],
   [{inviteError:{message:'already registered',code:'email_exists'},otpError:{message:'Error sending email',status:500}},503,false],
   [{inviteError:{message:'already registered',code:'email_exists'},role:'clinician'},409,false],
   [{throws:true},500,false],
  ]) {
   const h=setup(config); const response=await h.post(request('replace'));assert.equal(response.status,expected);
   assert.equal(h.calls.find(([name])=>name==='finish_patient_email_invitation')[1].p_success,success);
   assert.equal(response.body.sent,undefined,'never assert inbox delivery');if(mode)assert.equal(response.body.mode,mode);
   if(mode==='resume')assert.deepEqual(h.calls.find(([name])=>name==='otp'),['otp',false]);
   if(expected===503||expected===429)assert(!JSON.stringify(response.body).includes('sensitive@example.invalid'));
  }
  const linked=setup({linked:true});assert.equal((await linked.post(request('replace'))).status,409);assert.equal(linked.calls.length,0);
  const cooldown=setup({cooldown:true});assert.equal((await cooldown.post(request('send'))).status,429);assert(!cooldown.calls.some(([name])=>name==='invite'));
  const failedFinalize=setup({finish:false});assert.equal((await failedFinalize.post(request('send'))).status,500);
  const revoked=setup();assert.equal((await revoked.post(request('revoke'))).body.status,'revoked');assert(!revoked.calls.some(([name])=>name==='invite'));
  assert(!logs.some(value=>/synthetic-token-not-real|sensitive@example.invalid|sensitive provider detail/.test(value)));
 }finally{
  Object.assign(console,original);for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];
 }
});
