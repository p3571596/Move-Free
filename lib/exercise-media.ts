/** Stage 1 persists external media in exercises.video_url. Future sources have distinct identities. */
export type ExerciseMedia =
  | { kind: "external_video"; provider: "youtube" | "vimeo"; videoId: string; url: string; embedUrl: string }
  | { kind: "move_free_library_video"; mediaId: string }
  | { kind: "clinician_recorded_video"; mediaId: string; clinicianId: string }
  | { kind: "patient_recorded_video"; mediaId: string; patientId: string };
export type ExternalVideo = Extract<ExerciseMedia, {kind:"external_video"}>;

export function parseExerciseVideo(raw?: string | null): ExternalVideo | null {
  if (!raw?.trim()) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtube-nocookie.com","youtube-nocookie.com"].includes(host)) {
    const path = url.pathname.split("/").filter(Boolean);
    const id = host === "youtu.be" ? (path.length === 1 ? path[0] : "") : url.pathname === "/watch" ? url.searchParams.get("v") : path.length === 2 && ["embed","shorts","live"].includes(path[0]) ? path[1] : "";
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return {kind:"external_video",provider:"youtube",videoId:id,url:`https://www.youtube.com/watch?v=${id}`,embedUrl:`https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&autoplay=0`};
  }
  if (["vimeo.com","www.vimeo.com","player.vimeo.com"].includes(host)) {
    const match = host === "player.vimeo.com" ? url.pathname.match(/^\/video\/(\d+)\/?$/) : url.pathname.match(/^\/(\d+)(?:\/([a-fA-F0-9]+))?\/?$/);
    if (!match) return null;
    const hash = match[2] ?? url.searchParams.get("h");
    if (hash && !/^[a-fA-F0-9]{6,64}$/.test(hash)) return null;
    const id=match[1];
    return {kind:"external_video",provider:"vimeo",videoId:id,url:`https://vimeo.com/${id}${hash?`/${hash}`:""}`,embedUrl:`https://player.vimeo.com/video/${id}?playsinline=1&autoplay=0&dnt=1${hash?`&h=${hash}`:""}`};
  }
  return null;
}
export function validatedVideoUrl(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const video=parseExerciseVideo(raw);
  if(!video) throw new Error("Use an HTTPS YouTube or Vimeo link to a single video.");
  return video.url;
}
export function approvedVideoFromForm(form: FormData): string | null {
  const url=validatedVideoUrl(String(form.get("video_url")??""));
  if(url && form.get("video_approved")!=="yes") throw new Error("Preview the video and confirm you approve it before saving.");
  return url;
}
export function formatRepsOrTime(value?: string | number | null): string {
  if(value==null || String(value).trim()==="")return "";
  const text=String(value).trim();
  return /^\d+(?:\s*[-–]\s*\d+)?$/.test(text)?`${text} reps`:text;
}
