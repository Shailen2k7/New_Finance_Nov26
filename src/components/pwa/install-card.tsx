"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share, Smartphone } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** Settings card that installs the portal as an app, or explains how on iPhone. */
export function InstallAppCard() {
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <Card>
      <CardHeader title="Phone app" subtitle="Open Migrizo Finance from your home screen, full screen, like any other app." />
      {installed ? (
        <p className="flex items-center gap-2 text-[14px] text-success"><CheckCircle2 className="h-4 w-4" /> Installed on this device</p>
      ) : prompt ? (
        <Button className="w-full" onClick={async () => { await prompt.prompt(); const r = await prompt.userChoice; if (r.outcome === "accepted") setPrompt(null); }}>
          <Download className="h-4 w-4" /> Install app
        </Button>
      ) : ios ? (
        <ol className="space-y-2 text-[14px] text-ink-2">
          <li className="flex items-start gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[12px] font-semibold text-primary">1</span><span>Open this site in <b>Safari</b> and tap <Share className="inline h-4 w-4 align-[-3px]" /> <b>Share</b>.</span></li>
          <li className="flex items-start gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[12px] font-semibold text-primary">2</span><span>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
        </ol>
      ) : (
        <p className="flex items-start gap-2 text-[14px] text-ink-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><span>On Android, open this site in Chrome and choose <b>Install app</b> from the ⋮ menu. On a computer, use the install icon in the address bar.</span></p>
      )}
    </Card>
  );
}
