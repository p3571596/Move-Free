import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';

test('browser resumable upload sends exactly one fresh authorization header',async()=>{
 const old=process.env.NEXT_PUBLIC_SUPABASE_URL;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://testproject.supabase.co';
 let calls=0;
 class Upload {
  constructor(file,options){this.options=options;assert.equal(options.endpoint,'https://testproject.storage.supabase.co/storage/v1/upload/resumable');}
  async findPreviousUploads(){return [];}
  start(){void(async()=>{try{
   // XHR appends repeated setRequestHeader calls, unlike Node's HTTP client.
   const headers=new Map();const req={setHeader:(k,v)=>headers.set(k.toLowerCase(),headers.has(k.toLowerCase())?headers.get(k.toLowerCase())+', '+v:v)};
   for(const [k,v] of Object.entries(this.options.headers??{}))req.setHeader(k,v);
   await this.options.onBeforeRequest(req);
   assert.equal(headers.get('authorization'),'Bearer refreshed-token');
   this.options.onSuccess();
  }catch(e){this.options.onError(e);}})();}
 }
 const m=new Module('creation-media.ts');
 m.require=n=>n==='tus-js-client'?{Upload}:{createSupabaseBrowserClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:++calls===1?'old-token':'refreshed-token'}}})}})};
 m._compile(ts.transpileModule(fs.readFileSync('lib/creation-media.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'creation-media.ts');
 try {await m.exports.uploadCreationMedia({size:100,lastModified:1,type:'video/mp4'},'test',()=>{},new AbortController().signal);assert.equal(calls,2);}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=old;}
});
