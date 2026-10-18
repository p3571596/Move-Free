import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
function load(path){const m=new Module(path);m._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,path);return m.exports;}
test('native text composer preserves the complete fragment link without patient information',()=>{
 const {invitationMessage,textInvitationHref}=load('lib/invitation-sharing.ts');
 const link='https://example.invalid/join#token='+'a'.repeat(64);
 const href=textInvitationHref(link);assert(href.startsWith('sms:?&body='));
 assert.equal(new URLSearchParams(href.split('?')[1]).get('body'),invitationMessage(link));
 assert(invitationMessage(link).includes(link));assert(!invitationMessage(link).includes('STOP'));
});

test('pilot messages do not promise an email verification step',()=>{
 const {invitationMessage}=load('lib/invitation-sharing.ts');
 const body=invitationMessage('https://example.invalid/join#token='+'a'.repeat(64)+'&mode=pilot');
 assert(body.includes('Create your account'));assert(!body.includes('Verify your email'));
});

test('recovery sharing is neutral, expires in thirty minutes and never requests an old password or email code',()=>{
 const {invitationMessage,textInvitationHref}=load('lib/invitation-sharing.ts');
 const link='https://example.invalid/recover#token='+'a'.repeat(64),body=invitationMessage(link);
 assert(body.includes('new password'));assert(body.includes('30 minutes'));assert(body.includes(link));assert(!body.includes('7 days'));
 assert.equal(new URLSearchParams(textInvitationHref(link).split('?')[1]).get('body'),body);
});
