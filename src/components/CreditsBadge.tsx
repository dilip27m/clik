"use client";

import { Clock, Sparkles } from "lucide-react";

export interface Credits {
  left: number;
  total: number;
  resetsAt: string;
}

export function refillText(resetsAt: string): string {
  const at = new Date(resetsAt);
  const mins = Math.max(0, Math.round((at.getTime() - Date.now()) / 60000));
  const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const wait = mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`;
  return `Refills at ${time} (in ${wait})`;
}

// "57 of 80 scans left today" — free Gemini quota, shown in plain words.
export function CreditsBadge({ credits, compact }: { credits?: Credits; compact?: boolean }) {
  if (!credits) return null;
  const low = credits.left <= 5;
  const empty = credits.left === 0;
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
          empty ? "bg-rust-soft text-rust" : low ? "bg-gold-soft text-gold" : "bg-leaf-soft text-leaf"
        }`}
      >
        <Sparkles className="size-4" /> {credits.left} scans left today
      </span>
    );
  }
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${empty ? "border-rust/30 bg-rust-soft" : "border-line bg-paper"}`}>
      <span className={`grid size-11 place-items-center rounded-xl ${empty ? "bg-rust text-white" : "bg-leaf-soft text-leaf"}`}>
        {empty ? <Clock className="size-5" /> : <Sparkles className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">
          {empty ? "Free scans used up for today" : `${credits.left} of ${credits.total} scans left today`}
        </p>
        <p className="text-sm text-ink-soft">{refillText(credits.resetsAt)}</p>
      </div>
      {!empty && (
        <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-line sm:block">
          <div className="h-full rounded-full bg-leaf" style={{ width: `${(credits.left / credits.total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
