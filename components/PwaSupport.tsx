"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function PwaSupport() {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [offline, setOffline] = useState(false);
  const [help, setHelp] = useState(false);
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const updateDisplay = () => setStandalone(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const updateOnline = () => setOffline(!navigator.onLine);
    const capture = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent); };
    const installed = () => { setInstall(null); setStandalone(true); };
    updateDisplay(); updateOnline();
    window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    window.addEventListener("beforeinstallprompt", capture); window.addEventListener("appinstalled", installed);
    media.addEventListener("change", updateDisplay);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    return () => {
      window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline);
      window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", installed);
      media.removeEventListener("change", updateDisplay);
    };
  }, []);
  return <>
    {offline ? <div className="connection-notice" role="status">You’re offline. Reconnect before sending feedback or changing a plan. Unsaved changes are not stored.</div> : null}
    {!standalone ? <div className="install-support">
      <button type="button" onClick={async () => { if (install) { await install.prompt(); await install.userChoice; setInstall(null); } else setHelp(!help); }}>Add Move Free to your home screen</button>
      {help ? <p>On iPhone or iPad, open in Safari, tap Share, then Add to Home Screen. On Android, open your browser menu and choose Install app or Add to Home screen. You can also keep using your browser.</p> : null}
    </div> : null}
  </>;
}
