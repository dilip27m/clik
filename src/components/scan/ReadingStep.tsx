"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { ReadProgress } from "@/lib/client/useScanFlow";
import { Spinner } from "@/components/ui/Spinner";

// Typical AI read time. The bar eases toward 95% around this pace and keeps
// creeping after it, so it never looks frozen even when Google is slow.
const AI_PACE_MS = 9000;

function percent(p: ReadProgress | undefined, now: number): number {
  if (!p) return 6; // preparing the photo on the phone
  if (p.done) return 100;
  if (p.aiStartedAt === null) return 10 + 20 * p.sent; // real upload progress
  const t = Math.max(0, now - p.aiStartedAt);
  return 30 + 65 * (1 - Math.exp(-t / AI_PACE_MS));
}

function message(p: ReadProgress | undefined, now: number): string {
  if (!p) return "Getting the photo ready…";
  if (p.done) return "Done!";
  if (p.aiStartedAt === null) return "Sending the photo…";
  const s = (now - p.aiStartedAt) / 1000;
  if (s < 4) return "Reading the bill…";
  if (s < 9) return "Finding the bill number and date…";
  if (s < 15) return "Checking the amounts…";
  if (s < 25) return "Almost done…";
  return "Google is a little slow right now — still reading…";
}

// Photo with a moving scan line, a progress bar and three small steps.
export function ReadingStep({ src, progress }: { src?: string; progress?: ReadProgress }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(t);
  }, []);

  const pct = Math.round(percent(progress, now));
  const steps = [
    { label: "Photo", done: !!progress, active: !progress },
    { label: "Sent", done: !!progress && progress.aiStartedAt !== null, active: !!progress && progress.aiStartedAt === null },
    { label: "AI read", done: !!progress?.done, active: !!progress && progress.aiStartedAt !== null && !progress.done },
  ];

  return (
    <div className="mx-auto max-w-md space-y-5 animate-rise">
      {src && (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-[#efe6d8] shadow-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Your bill" className="max-h-[38vh] w-full object-contain opacity-90" />
          {!progress?.done && (
            <div className="absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-clay/35 to-transparent animate-scan-line" />
          )}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-paper p-4 shadow-card">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="font-semibold text-clay-dark" aria-live="polite">
            {message(progress, now)}
          </p>
          <span className="font-display text-lg font-semibold text-ink tabular-nums">{pct}%</span>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Reading the bill"
        >
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-clay to-gold transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          >
            <div className="absolute inset-0 animate-pulse bg-white/20" />
          </div>
        </div>
        <ol className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {steps.map((s) => (
            <li key={s.label} className={`flex items-center gap-1.5 ${s.done ? "text-leaf" : s.active ? "text-clay-dark" : "text-ink-faint"}`}>
              {s.done ? (
                <Check className="size-4 shrink-0" />
              ) : s.active ? (
                <Spinner className="size-4 shrink-0" />
              ) : (
                <span className="size-4 shrink-0 rounded-full border-2 border-current opacity-50" />
              )}
              <span className="truncate font-medium">{s.label}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-center text-sm text-ink-soft">Usually takes 5 to 20 seconds.</p>
    </div>
  );
}
