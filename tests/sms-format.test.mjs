import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
import twilio from 'twilio';
import * as phone from 'libphonenumber-js/max';
const mod=new Module('sms');mod.require=n=>n==='twilio'?twilio:phone;
mod._compile(ts.transpileModule(fs.readFileSync('lib/sms.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,'sms');
const {normalizeMobile,smsBody}=mod.exports;
test('normalize international mobile numbers and keep text neutral',()=>{
 assert.equal(normalizeMobile('+1 (202) 555-0123'),'+12025550123');
 assert.equal(normalizeMobile('+44 7911 123456'),'+447911123456');
 assert.throws(()=>normalizeMobile('2025550123'));assert.throws(()=>normalizeMobile('+12025550123 ext 123'));assert.throws(()=>normalizeMobile('+999123'));
 const body=smsBody('https://example.invalid/join#token='+'a'.repeat(64));
 assert(!/diagnosis|treatment|patient|password|pain/i.test(body));assert(body.includes('STOP'));
});
