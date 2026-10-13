export async function sampleVideoFrames(source: File): Promise<string[]> {
  const own = true;
  const url = URL.createObjectURL(source);
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const wait = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          done(
            new Error(
              "Video frames are unavailable in this browser. Use clinician context or a compatible MP4.",
            ),
          ),
        12000,
      );
      const good = () => done();
      const bad = () => done(new Error("Video cannot be decoded."));
      const done = (error?: Error) => {
        clearTimeout(timer);
        video.removeEventListener(event, good);
        video.removeEventListener("error", bad);
        if (error) reject(error);
        else resolve();
      };
      video.addEventListener(event, good, { once: true });
      video.addEventListener("error", bad, { once: true });
    });
  try {
    const loaded = wait("loadeddata");
    video.src = url;
    video.load();
    await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("Video duration unavailable.");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = Math.max(
      1,
      Math.round((video.videoHeight / video.videoWidth) * 320),
    );
    if (canvas.height > 480) {
      canvas.width = Math.round((canvas.width * 480) / canvas.height);
      canvas.height = 480;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Video frames unavailable.");
    const frames: string[] = [];
    for (let i = 0; i < 4; i++) {
      const seek = wait("seeked");
      video.currentTime = Math.max(0.001, (video.duration * (i + 0.5)) / 4);
      await seek;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.55));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    if (own) URL.revokeObjectURL(url);
  }
}
