"use client";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { CREATION_BUCKET } from "@/lib/creation-media";
import type { CreationMedia } from "@/lib/types";
import { PrivateVideoPlayer } from "./PrivateVideoPlayer";
export function PrescriptionMedia({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [media, setMedia] = useState<CreationMedia | null>(null),
    [loaded, setLoaded] = useState(false);
  const reported = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      const { data } = await createSupabaseBrowserClient()
        .from("exercise_creation_media")
        .select("*")
        .eq("id", id)
        .eq("state", "ready")
        .maybeSingle();
      if (active) {
        setMedia(data);
        setLoaded(true);
      }
    };
    void load();
    const timer = setInterval(load, 15000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [id]);
  if (!loaded) return <p>Loading private demonstration…</p>;
  if (!media)
    return (
      <p>
        The recording is unavailable or was removed. Contact your therapist if
        you need a replacement.
      </p>
    );
  return (
    <PrivateVideoPlayer
      key={id}
      bucket={CREATION_BUCKET}
      path={media.object_path}
      title={title}
      onViewed={() => {
        if (!reported.current) {
          reported.current = true;
          void createSupabaseBrowserClient().rpc("stage2_video_played", {
            p_media: id,
          });
        }
      }}
    />
  );
}
