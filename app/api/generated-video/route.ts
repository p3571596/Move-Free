import { createClient } from '@supabase/supabase-js';
import { experimental_startVideo as startVideo, experimental_getVideoStatus as getVideoStatus } from 'ai';
import { getVercelOidcToken } from '@vercel/oidc';
import { gateway } from '@ai-sdk/gateway';
import { pilotFeatureEnabled } from '@/lib/pilot-flags';
import { GENERATION_BUCKET, GENERATION_MODEL, generationPrompt, generationPriceVerified, isMovement } from '@/lib/generated-video';
import type { Database, Json } from '@/lib/types';
export const runtime='nodejs';
export const maxDuration=120;
const columns='id,movement,status,object_path,error_code,reviewed_content,created_at,cost_cents,asset_id' as const;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function clients(request:Request) {
 const bearer=request.headers.get('authorization'),url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SECRET_KEY;
 if(!bearer?.startsWith('Bearer ')||bearer.length>5000) return {error:reply({error:'Sign in required.'},401)};
 if(!url||!pub||!secret) return {error:reply({error:'Generation service is not configured.'},503)};
 const db=createClient<Database>(url,pub,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await db.auth.getUser(bearer.slice(7));
 if(error||!user)return {error:reply({error:'Sign in required.'},401)};
 if(!await pilotFeatureEnabled(db,'ai_video_generation'))return {error:reply({error:'Access denied.'},403)};
 return {db,user,admin:createClient<Database>(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})};
}
async function videoBytes(video:{type:string;url?:string;data?:string|Uint8Array;mediaType:string}) {
 if(video.mediaType!=='video/mp4')throw new Error('VIDEO_FORMAT');
 let bytes:Uint8Array;
 if(video.type==='url') {
  const url=new URL(video.url!);
  if(url.protocol!=='https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname))throw new Error('VIDEO_URL');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok||Number(response.headers.get('content-length'))>26214400)throw new Error('DOWNLOAD');
  const reader=response.body?.getReader();if(!reader)throw new Error('DOWNLOAD');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>26214400){await reader.cancel();throw new Error('VIDEO_SIZE');}chunks.push(value);}
  bytes=Buffer.concat(chunks);
 }else bytes=typeof video.data==='string'?Buffer.from(video.data,'base64'):video.data!;
 if(!bytes?.length||bytes.length>26214400)throw new Error('VIDEO_SIZE');
 return bytes;
}
export async function POST(request:Request) {
 const c=await clients(request);if(c.error)return c.error;
 const {db,admin,user}=c;
 if(Number(request.headers.get('content-length'))>2000)return reply({error:'Invalid request.'},400);
 let body:Record<string,unknown>;
 try{const reader=request.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000){await reader.cancel();throw new Error();}chunks.push(value);}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply({error:'Invalid request.'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);
 if(body.action==='assign') {
  if(Object.keys(body).some(k=>!['action','id','assetId','patientId','exerciseId'].includes(k))||![body.id,body.assetId,body.patientId,body.exerciseId].every(uuid))return reply({error:'Invalid assignment.'},400);
  if(!await pilotFeatureEnabled(db,'personalized_exercises'))return reply({error:'Personalized video access denied.'},403);
  const {data:job}=await admin.from('clinician_video_generation_jobs').select('*').eq('id',body.id as string).eq('owner_id',user.id).single();
  if(job?.status==='approved'&&job.asset_id===body.assetId)return reply({job:{id:job.id,status:job.status,asset_id:job.asset_id}});
  if(!job||job.status!=='reviewed'||!job.object_path)return reply({error:'Review this draft first.'},409);
  const path=`${body.assetId}/source`;
  try {
   const downloaded=await admin.storage.from(GENERATION_BUCKET).download(job.object_path);if(downloaded.error||!downloaded.data)throw new Error();
   const bytes=await downloaded.data.arrayBuffer();
   const existing=await db.from('exercise_video_assets').select('*').eq('id',body.assetId as string).maybeSingle();
   if(existing.data && (existing.data.generated_job_id!==job.id||existing.data.program_exercise_id!==body.exerciseId||existing.data.patient_id!==body.patientId||existing.data.owner_id!==user.id))throw new Error();
   if(!existing.data){const inserted=await db.from('exercise_video_assets').insert({id:body.assetId as string,patient_id:body.patientId as string,program_exercise_id:body.exerciseId as string,owner_id:user.id,kind:'demonstration',state:'uploading',generated_job_id:job.id,object_path:path,mime_type:'video/mp4',byte_size:bytes.byteLength});if(inserted.error)throw new Error();const linked=await admin.from('clinician_video_generation_jobs').update({asset_id:body.assetId as string}).eq('id',job.id).eq('status','reviewed');if(linked.error)throw new Error();}
   if(!existing.data||existing.data.state==='uploading') {
    const exists=await admin.storage.from('exercise-video-preview').info(path);
    if(exists.error){const saved=await admin.storage.from('exercise-video-preview').upload(path,bytes,{contentType:'video/mp4',upsert:false,cacheControl:'0'});if(saved.error)throw new Error();}
    const finish=await db.rpc('finish_exercise_video',{p_id:body.assetId as string});if(finish.error)throw new Error();
   }
   const assigned=await db.rpc('assign_generated_video',{p_job:job.id,p_asset:body.assetId as string});if(assigned.error)throw new Error();
   return reply({job:{id:job.id,status:'approved',asset_id:body.assetId}});
  }catch{return reply({error:'Assignment was not completed. Save the reviewed name and exact numerical FITT, check access, and retry. The draft remains private.'},409);}
 }
 if(Object.keys(body).some(k=>!['id','movement','costAccepted'].includes(k))||!uuid(body.id)||!isMovement(body.movement)||body.costAccepted!==true)return reply({error:'Choose a pilot movement and accept the $0.40 estimate. Patient information and custom prompts are not accepted.'},400);
 if(!process.env.AI_GATEWAY_API_KEY){try{await getVercelOidcToken();}catch{return reply({error:'Vercel AI Gateway credentials are unavailable. Enable project OIDC authentication or configure a Gateway credential.'},503);}}
 if(!await generationPriceVerified())return reply({error:'The current Veo price or capability could not be verified. Generation is paused; no paid job was started.'},503);
 const begin=await db.rpc('begin_video_generation',{p_id:body.id,p_movement:body.movement});
 if(begin.error)return reply({error:'Generation limit reached or another job is active. Resume the existing job. Daily reservations are capped at $5 UTC.'},429);
 const claimed=await admin.from('clinician_video_generation_jobs').update({status:'generating'}).eq('id',body.id).eq('owner_id',user.id).eq('status','starting').select('id').maybeSingle();
 if(claimed.error)return reply({error:'Generation could not reserve its server job. Retry this request without changing its ID; no provider call was made.'},503);
 if(!claimed.data){const existing=await db.from('clinician_video_generation_jobs').select(columns).eq('id',body.id).single();return reply({job:existing.data});}
 try {
  const result=await startVideo({model:gateway.videoModel(GENERATION_MODEL),prompt:generationPrompt(body.movement),duration:4,resolution:'1280x720',aspectRatio:'16:9',generateAudio:false,n:1,maxRetries:0,abortSignal:AbortSignal.timeout(45000)});
  const saved=await admin.from('clinician_video_generation_jobs').update({provider_operation:result.operation as Json}).eq('id',body.id).eq('owner_id',user.id);
  if(saved.error)throw new Error();
  return reply({job:{id:body.id,movement:body.movement,status:'generating',cost_cents:40}});
 }catch(e) {
  const status=typeof e==='object'&&e!==null&&'statusCode' in e?Number(e.statusCode):0;
  const code=status===402?'GATEWAY_CREDITS_REQUIRED':status===403?'GATEWAY_ACCESS_DENIED':status===401?'GATEWAY_AUTH_FAILED':'START_FAILED_OR_UNCERTAIN';
  await admin.from('clinician_video_generation_jobs').update({status:'failed',error_code:code}).eq('id',body.id).eq('owner_id',user.id);
  return reply({error:`${code}. Veo could not start or its response was lost. Check Gateway access/credits. No automatic retry was made; this attempt retains its $0.40 reservation. Retry explicitly or use another source.`},502);
 }
}
export async function GET(request:Request) {
 const c=await clients(request);if(c.error)return c.error;const {db,admin,user}=c;
 const id=new URL(request.url).searchParams.get('id');
 if(!id){const {data,error}=await db.from('clinician_video_generation_jobs').select(columns).order('created_at',{ascending:false}).limit(12);return error?reply({error:'Drafts unavailable.'},503):reply({jobs:data});}
 if(!uuid(id))return reply({error:'Invalid draft.'},400);
 const {data:job}=await admin.from('clinician_video_generation_jobs').select('*').eq('id',id).eq('owner_id',user.id).single();
 if(!job)return reply({error:'Draft unavailable.'},404);
 try {
  if(['starting','generating'].includes(job.status)&&!job.provider_operation&&Date.parse(job.created_at)<Date.now()-300000){await admin.from('clinician_video_generation_jobs').update({status:'failed',error_code:'START_UNCERTAIN'}).eq('id',id).eq('status',job.status);}
  if(job.status==='generating'&&job.provider_operation) {
   const result=await getVideoStatus(gateway.videoModel(GENERATION_MODEL),{operation:job.provider_operation,maxRetries:0,abortSignal:AbortSignal.timeout(45000)});
   if(result.status==='error')await admin.from('clinician_video_generation_jobs').update({status:'failed',error_code:'PROVIDER_FAILED'}).eq('id',id).eq('status','generating');
   if(result.status==='completed') {
    if(!await pilotFeatureEnabled(db,'ai_video_generation'))return reply({error:'Access changed.'},403);
    const bytes=await videoBytes(result.videos[0]);const path=`${id}/source.mp4`;
    const uploaded=await admin.storage.from(GENERATION_BUCKET).upload(path,bytes,{contentType:'video/mp4',upsert:false,cacheControl:'0'});
    if(uploaded.error){const info=await admin.storage.from(GENERATION_BUCKET).info(path);if(info.error)throw new Error();}
    const saved=await admin.from('clinician_video_generation_jobs').update({status:'ready',object_path:path}).eq('id',id).eq('status','generating');if(saved.error)throw new Error();
   }
  }
  const {data,error}=await db.from('clinician_video_generation_jobs').select(columns).eq('id',id).single();if(error)throw new Error();return reply({job:data});
 }catch{return reply({error:'Status or private storage is temporarily unavailable. Retry status to resume this job without creating a new paid generation.'},502);}
}
