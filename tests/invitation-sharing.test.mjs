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
