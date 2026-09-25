import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
const id='00000000-0000-4000-8000-000000000001';
function handler({signedIn=true,draft=null}={}){
 const client={auth:{getUser:async()=>({data:{user:signedIn?{id}:null},error:null})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:draft,error:draft?null:{message:'denied'}})})};
 const m=new Module('exercise-draft-route');m.require=n=>n==='@supabase/supabase-js'?{createClient:()=>client}:{generateExerciseDraft:()=>{throw new Error('AI must not be called')}};
 m._compile(ts.transpileModule(fs.readFileSync('app/api/exercise-draft/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'exercise-draft-route');return m.exports.POST;
}
const request=(token=true,body={draftId:id,context:'Synthetic context'})=>new Request('http://localhost/api/exercise-draft',{method:'POST',headers:token?{Authorization:'Bearer synthetic'}:{},body:JSON.stringify(body)});
test('AI route denies anonymous/expired/unauthorized callers before checking secrets',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic';delete process.env.OPENAI_API_KEY;delete process.env.SUPABASE_SECRET_KEY;
 assert.equal((await handler()(request(false))).status,401);
 assert.equal((await handler({signedIn:false})(request())).status,401);
 assert.equal((await handler()(request())).status,403);
 assert.equal((await handler({draft:{id,state:'draft',revision:0}})(request())).status,503);
});
test('AI route bounds input and rejects arbitrary remote image URLs',async()=>{
 const post=handler({draft:{id,state:'draft',revision:0}});
 assert.equal((await post(request(true,{draftId:id,context:'x',frames:['https://evil.invalid/video']}))).status,400);
 assert.equal((await post(request(true,{draftId:id,context:'x'.repeat(3000001)}))).status,413);
});
