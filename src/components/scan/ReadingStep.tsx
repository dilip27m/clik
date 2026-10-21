"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

const MESSAGES = ["Reading the bill…", "Finding the bill number and date…", "Checking the amounts…", "Almost done…"];

// Photo with a moving scan line while the AI reads it.
export function ReadingStep({ src, label }: { src?: string; label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, MESSAGES.length - 1)), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-5 text-center animate-rise">
      {src && (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-[#efe6d8] shadow-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Your bill" className="max-h-[55vh] w-full object-contain opacity-90" />
          <div className="absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-clay/35 to-transparent animate-scan-line" />
        </div>
      )}
      <div className="flex items-center justify-center gap-3 text-lg font-semibold text-clay-dark">
        <Spinner className="size-6" /> {label ?? MESSAGES[i]}
      </div>
      {!label && <p className="text-sm text-ink-soft">This usually takes 5 to 20 seconds.</p>}
    </div>
  );
}
