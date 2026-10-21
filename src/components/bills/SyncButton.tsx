"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/client/api";
import { Notice } from "@/components/ui/Notice";

interface SyncResult {
  addedToApp: number;
  sheetAdded: number;
  sheetUpdated: number;
  photosSent: number;
}

function summary(r: SyncResult): string {
  const parts = [];
  if (r.addedToApp) parts.push(`${r.addedToApp} bill${r.addedToApp > 1 ? "s" : ""} added to the app from the sheet`);
  if (r.sheetAdded) parts.push(`${r.sheetAdded} added to the sheet`);
  if (r.photosSent) parts.push(`${r.photosSent} photo${r.photosSent > 1 ? "s" : ""} sent to Drive`);
  parts.push(`${r.sheetUpdated} checked in the sheet`);
  return parts.join(" · ");
}

// Makes the app and this company's Google Sheet hold the same bills.
export function SyncButton({ company, onDone }: { company: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function sync() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<SyncResult>(`/api/sync?company=${company}`, { method: "POST" });
      setResult({ ok: true, text: summary(r) });
      onDone();
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Sync failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={sync}
        disabled={busy}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-paper px-4 font-semibold text-ink shadow-card hover:text-clay-dark disabled:opacity-70"
      >
        <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> {busy ? "Syncing…" : "Sync"}
      </button>
      {result && (
        <div className="basis-full">
          <Notice tone={result.ok ? "success" : "error"} title={result.ok ? "App and Google Sheet are in sync" : "Sync did not finish"}>
            {result.text}
          </Notice>
        </div>
      )}
    </>
  );
}
