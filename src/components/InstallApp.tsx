"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

const DISMISSED = "billbook:install-dismissed";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __installPrompt?: InstallPromptEvent;
  }
}

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

// "Put Bill Book on your home screen" — an Install button on Android/Chrome,
// and the two taps to do it on iPhone (Safari has no install button).
export function InstallApp() {
  const [mode, setMode] = useState<"hidden" | "button" | "ios">("hidden");

  useEffect(() => {
    try {
      if (isInstalled() || localStorage.getItem(DISMISSED)) return;
    } catch {}
    const check = () => {
      if (window.__installPrompt) setMode("button");
      else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setMode("ios");
    };
    check();
    const installed = () => setMode("hidden");
    window.addEventListener("billbook:installable", check);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("billbook:installable", check);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (mode === "hidden") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {}
    setMode("hidden");
  };

  const install = async () => {
    const prompt = window.__installPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    window.__installPrompt = undefined;
    if (outcome === "accepted") setMode("hidden");
  };

  return (
    <div className="relative flex items-center gap-4 rounded-2xl border border-clay/25 bg-paper p-4 shadow-card animate-rise">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg?v=2" alt="" className="size-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">Put Bill Book on your home screen</p>
        {mode === "button" ? (
          <p className="text-sm text-ink-soft">Opens like an app, and you can share bill photos to it from WhatsApp.</p>
        ) : (
          <p className="text-sm text-ink-soft">
            Tap <Share className="inline size-4 align-text-bottom" /> Share at the bottom, then <b>Add to Home Screen</b>.
          </p>
        )}
      </div>
      {mode === "button" && (
        <Button onClick={install} icon={<Download className="size-5" />}>
          Install
        </Button>
      )}
      <button onClick={dismiss} aria-label="Not now" className="absolute top-2 right-2 rounded-full p-1.5 text-ink-faint hover:bg-cream">
        <X className="size-4" />
      </button>
    </div>
  );
}
