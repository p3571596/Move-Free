import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
const m=new Module('auth-errors');m._compile(ts.transpileModule(fs.readFileSync('lib/auth-errors.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'auth-errors');
const {describePatientAuthError,describeAuthError}=m.exports;
test('account failure messages are actionable and never echo raw provider secrets',()=>{
 for(const [code,status,phrase] of [['weak_password',422,'weak or easy to guess'],['same_password',422,'different from'],['email_exists',409,'already has an account'],['over_request_rate_limit',429,'Wait a few minutes'],['email_address_invalid',400,'Check the email'],['signup_disabled',503,'disabled'],['user_banned',403,'Contact your clinician']]){
  const failure=describePatientAuthError({code,message:'secret password token'});assert.equal(failure.status,status);assert(failure.error.includes(phrase));assert(!JSON.stringify(failure).includes('secret'));
 }
 const unknown=describePatientAuthError({code:'secret-token',message:'secret password token'});assert.equal(unknown.code,'auth_unavailable');assert(!JSON.stringify(unknown).includes('secret'));
 assert(describeAuthError({code:'weak_password',message:'raw provider message'},'signup').message.includes('weak or easy to guess'));
 assert(!describeAuthError({message:'secret token'},'password-update').message.includes('secret'));
});
