"use client";
import {createSupabaseBrowserClient} from "./supabase";
import type {ExerciseVideoAsset} from "./types";
export const VIDEO_BUCKET = "exercise-video-preview";
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export function videoFileError(file: {type: string; size: number}) {
  if (!["video/mp4","video/webm","video/quicktime"].includes(file.type.split(";")[0])) return "Choose an MP4, WebM or MOV video.";
  if (!file.size || file.size > MAX_VIDEO_BYTES) return "Choose a short video of up to 25 MB.";
  return null;
}
export async function uploadPrivateVideo(file: File, patientId: string, exerciseId: string, kind: ExerciseVideoAsset["kind"], consent: boolean) {
  const validation=videoFileError(file);if(validation)throw new Error(validation);
  if(kind==="performance"&&!consent)throw new Error("Confirm that you want to share this recording with your treating clinician.");
  const db=createSupabaseBrowserClient();const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user)throw new Error("Please sign in again.");
  const id=crypto.randomUUID(),path=`${id}/source`,type=file.type.split(";")[0];
  const {error}=await db.from("exercise_video_assets").insert({id,patient_id:patientId,program_exercise_id:exerciseId,owner_id:user.id,kind,state:"uploading",object_path:path,mime_type:type,byte_size:file.size,consented_at:kind==="performance"?new Date().toISOString():null,consent_notice_version:kind==="performance"?"video-pilot-v1":null});
  if(error)throw new Error("Video access is unavailable. Check your care relationship and try again.");
  try {
    const upload=await db.storage.from(VIDEO_BUCKET).upload(path,file,{contentType:type,upsert:false,cacheControl:"0"});
    if(upload.error)throw upload.error;
    const finish=await db.rpc("finish_exercise_video",{p_id:id});if(finish.error)throw finish.error;
    return id;
  } catch {
    // Only the uploader's incomplete asset can be removed; approved files are immutable.
    const removed=await db.storage.from(VIDEO_BUCKET).remove([path]);
    if(!removed.error)await db.from("exercise_video_assets").delete().eq("id",id);
    throw new Error("The video could not be saved. Keep this page open with a stable connection and retry.");
  }
}
