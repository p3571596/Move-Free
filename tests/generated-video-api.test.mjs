import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import Module from 'node:module';import ts from 'typescript';
const load=(path,deps={})=>{const m=new Module(path);m.require=k=>deps[k];m._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,path);return m.exports;};
const generation=load('lib/generated-video.ts');
function setup({flag=true,claim=true}={}){const calls=[];const query={update(v){calls.push(['update',v]);return this;},eq(){return this;},select(){return this;},single:async()=>({data:{id:'00000000-0000-4000-8000-000000000020',status:'generating'}}),maybeSingle:async()=>({data:claim?{id:'claimed'}:null}),then:r=>Promise.resolve({error:null}).then(r)};
 const db={auth:{getUser:async()=>({data:{user:{id:'synthetic-clinician'}}})},rpc:async()=>{calls.push(['reservation']);return {data:'reserved'};},from:()=>query};
 const route=load('app/api/generated-video/route.ts',{'@supabase/supabase-js':{createClient:()=>db},'@/lib/pilot-flags':{pilotFeatureEnabled:async()=>flag},'@/lib/generated-video':generation,'@ai-sdk/gateway':{gateway:{videoModel:id=>id}},ai:{experimental_startVideo:async options=>{calls.push(['provider',options]);return {operation:{synthetic:true}};}}});return {route,calls};
}
const request=body=>new Request('https://example.invalid/api/generated-video',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(body)});
test('Veo requests contain only preset fictional movement; server rejects chart/context, gates independently and avoids charged retries',async()=>{
 const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','VERCEL_OIDC_TOKEN'],saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{for(const k of names)process.env[k]='synthetic';const body={id:'00000000-0000-4000-8000-000000000020',movement:'squat',costAccepted:true};
 let h=setup({flag:false});assert.equal((await h.route.POST(request(body))).status,403);assert.equal(h.calls.length,0);
 for(const extra of [{patientName:'Forbidden'},{prompt:'Forbidden'},{comparison:true}]){h=setup();assert.equal((await h.route.POST(request({...body,...extra}))).status,400);assert.equal(h.calls.length,0);}
 h=setup();assert.equal((await h.route.POST(request(body))).status,200);const p=h.calls.find(c=>c[0]==='provider')[1];assert.equal(p.maxRetries,0);assert.equal(p.duration,4);assert.equal(p.generateAudio,false);assert.equal(p.n,1);assert.equal(p.model,generation.GENERATION_MODEL);assert(!p.prompt.includes('synthetic-clinician'));assert(!('frameImages' in p));assert(!('inputReferences' in p));
 h=setup({claim:false});assert.equal((await h.route.POST(request(body))).status,200);assert(!h.calls.some(c=>c[0]==='provider'),'idempotent resume never restarts provider');
 }finally{for(const k of names){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});
