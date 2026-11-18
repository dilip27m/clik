"use client";

import { useState } from "react";
import { Check, CircleAlert, RotateCcw, TriangleAlert, X } from "lucide-react";
import { BILL_TYPES, formatDate, formatINR, formatQty } from "@/lib/bill-types";
import type { ScanJob } from "@/lib/client/useBatch";
import { BillTypeChip } from "@/components/bill/billStyle";
import { Button } from "@/components/ui/Button";

// What a finished photo needs from the person.
export type RowKind = "good" | "look" | "duplicate" | "unclear" | "failed";

export function rowKind(j: ScanJob): RowKind {
  if (j.status === "failed") return "failed";
  if (!j.result) return "unclear";
  if (j.existingId) return "duplicate";
  if (j.status === "check" || j.result.checks.length || j.result.unsure.length) return "look";
  return "good";
}

interface Props {
  jobs: ScanJob[]; // finished ones: ready / check / failed
  onOpen: (id: number) => void;
  onConfirm: (job: ScanJob) => Promise<void>;
  onReject: (id: number) => void;
  onRetry: (id: number) => void;
}

// The review table after reading: one row per photo. Tap the photo to check
// it side by side; quick ✓ / ✗ for bills that look right.
export function BatchTable({ jobs, onOpen, onConfirm, onReject, onRetry }: Props) {
  const good = jobs.filter((j) => rowKind(j) === "good");
  const [busy, setBusy] = useState<Set<number>>(new Set());

  const confirm = async (job: ScanJob) => {
    setBusy((b) => new Set(b).add(job.id));
    try {
      await onConfirm(job);
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(job.id);
        return n;
      });
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Check and save</h2>
          <p className="text-sm text-ink-soft">Tap a photo to compare it with what was read.</p>
        </div>
        {good.length > 1 && (
          <Button variant="secondary" icon={<Check className="size-5" />} onClick={() => good.forEach(confirm)}>
            Save all {good.length} that look right
          </Button>
        )}
      </div>

      {jobs.map((j) => (
        <Row key={j.id} job={j} busy={busy.has(j.id)} onOpen={onOpen} onConfirm={confirm} onReject={onReject} onRetry={onRetry} />
      ))}
    </section>
  );
}

function Row({
  job,
  busy,
  onOpen,
  onConfirm,
  onReject,
  onRetry,
}: {
  job: ScanJob;
  busy: boolean;
  onOpen: (id: number) => void;
  onConfirm: (job: ScanJob) => void;
  onReject: (id: number) => void;
  onRetry: (id: number) => void;
}) {
  const kind = rowKind(job);
  const r = job.result;
  const def = r ? BILL_TYPES[r.type] : null;
  const d = r?.data ?? {};
  const docNo = def ? String(d[def.keyField] ?? "—") : "";
  const party = def ? String(d[def.partyField] ?? "") : "";
  const amount = def?.amountField && typeof d[def.amountField] === "number" ? formatINR(d[def.amountField] as number, 0) : null;
  const qty = typeof d.qty === "number" ? formatQty(d.qty) : null;
  const issues = r ? r.checks.length + r.unsure.length : 0;

  const status = {
    good: { tone: "text-leaf", icon: <Check className="size-4" />, text: "Looks right" },
    look: { tone: "text-[#7a5308]", icon: <TriangleAlert className="size-4" />, text: job.error ?? `${issues} ${issues === 1 ? "field needs" : "fields need"} a look` },
    duplicate: { tone: "text-[#7a5308]", icon: <TriangleAlert className="size-4" />, text: "Already saved before" },
    unclear: { tone: "text-[#7a5308]", icon: <TriangleAlert className="size-4" />, text: job.error ?? "Photo could not be read" },
    failed: { tone: "text-rust", icon: <CircleAlert className="size-4" />, text: job.error ?? "Could not read this photo" },
  }[kind];

  return (
    <div className="rounded-2xl border border-line bg-paper p-3 shadow-card">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onOpen(job.id)}
          aria-label="Open this bill"
          className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-[#efe6d8] sm:size-24"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/scan-jobs/${job.id}/photo?thumb=1`} alt="Bill photo" loading="lazy" className="h-full w-full object-cover" />
        </button>

        <div className="min-w-0 flex-1">
          {r && def ? (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-ink">{docNo}</span>
                <BillTypeChip type={r.type} size="sm" />
              </div>
              <p className="truncate text-sm text-ink-soft">{party || "—"}</p>
              <p className="text-sm text-ink-faint">
                {formatDate(String(d.date ?? ""))}
                {qty && ` · ${qty}`}
                {amount && ` · ${amount}`}
              </p>
            </>
          ) : (
            <p className="font-semibold text-ink">Photo {job.id}</p>
          )}
          <p className={`mt-1 flex items-start gap-1.5 text-sm font-medium ${status.tone}`}>
            <span className="mt-0.5 shrink-0">{status.icon}</span>
            <span className="line-clamp-2">{status.text}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {kind === "good" && (
          <Button size="md" className="flex-1" loading={busy} icon={<Check className="size-5" />} onClick={() => onConfirm(job)}>
            Save
          </Button>
        )}
        {(kind === "look" || kind === "duplicate") && (
          <Button size="md" className="flex-1" variant="secondary" onClick={() => onOpen(job.id)}>
            Check
          </Button>
        )}
        {kind === "unclear" && (
          <Button size="md" className="flex-1" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => onRetry(job.id)}>
            Read anyway
          </Button>
        )}
        {kind === "failed" && (
          <Button size="md" className="flex-1" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => onRetry(job.id)}>
            Retry
          </Button>
        )}
        <Button size="md" variant="ghost" icon={<X className="size-5" />} onClick={() => onReject(job.id)}>
          Reject
        </Button>
      </div>
    </div>
  );
}
