import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
test('patient playback executes lazy RPC and retries on a failed report',async()=>{
 let state=0,requests=0;const ref={current:false};
 const m=new Module('PrescriptionMedia.tsx');
 m.require=n=>({
  react:{useEffect:()=>{},useRef:()=>ref,useState:()=>[++state===1?{object_path:'private/source'}:true,()=>{}]},
  'react/jsx-runtime':{jsx:(type,props)=>({type,props})},
  '@/lib/supabase':{createSupabaseBrowserClient:()=>({rpc:()=>({then(resolve){requests++;resolve({error:requests===1?new Error('offline'):null});}})})},
  '@/lib/creation-media':{CREATION_BUCKET:'exercise-creation-private'},
  './PrivateVideoPlayer':{PrivateVideoPlayer:()=>null},
 })[n];
 m._compile(ts.transpileModule(fs.readFileSync('components/PrescriptionMedia.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,'PrescriptionMedia.tsx');
 const view=m.exports.PrescriptionMedia({id:'media',title:'Synthetic'});
 await view.props.onViewed();assert.equal(requests,1);assert.equal(ref.current,false);
 await view.props.onViewed();assert.equal(requests,2);assert.equal(ref.current,true);
 await view.props.onViewed();assert.equal(requests,2);
});
