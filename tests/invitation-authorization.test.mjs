import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';

function handler(patient, signedIn=true) {
 const mod=new Module('invite-route');
 const client = {
  auth: {getUser: async () => ({data: {user: signedIn ? {id: 'synthetic-clinician'} : null}, error: null})},
  from: () => ({
   select() {return this;}, eq() {return this;},
   maybeSingle: async () => ({data: patient, error: null}),
  }),
 };
 const dependencies = {
  'next/server': {NextResponse: {json: (body, {status}) => ({body, status})}},
  '@/lib/app-url': {getAppRoute: () => {throw Error('Email must not be sent in this test');}},
  '@supabase/supabase-js': {createClient: () => client},
 };
 mod.require = name => dependencies[name];
 mod._compile(ts.transpileModule(fs.readFileSync('app/api/patient-invitations/email/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'invite-route');
 return mod.exports.POST;
}
const request=token=>({headers:new Headers(token?{authorization:'Bearer '+token}:{}),json:async()=>({patientId:'synthetic-patient',email:'synthetic@example.invalid'})});
test('invitation authorization remains authoritative when delivery secrets are absent',async()=>{
 const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'];const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic';delete process.env.SUPABASE_SECRET_KEY;
  assert.equal((await handler(null)(request())).status,401);
  assert.equal((await handler(null,false)(request('invalid'))).status,401);
  assert.equal((await handler(null)(request('unrelated'))).status,403);
  assert.equal((await handler({id:'synthetic-patient'})(request('owner'))).status,503);
 }finally{for(const n of names)if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}
});
