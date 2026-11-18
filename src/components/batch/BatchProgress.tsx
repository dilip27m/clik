"use client";

import { useEffect, useState } from "react";
import { Check, Clock, X } from "lucide-react";
import { isReading, type ScanJob, type UploadProgress } from "@/lib/client/useBatch";
import { refillText } from "@/components/CreditsBadge";
import { Spinner } from "@/components/ui/Spinner";

const AT_ONCE = 2;            // photos the server reads at the same time
const DEFAULT_READ_S = 15;    // until we have real times from this batch

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600 ? `${Math.floor(s / 3600)} hr ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function aboutLeft(seconds: number): string {
  if (seconds < 15) return "a few seconds left";
  if (seconds < 60) return `about ${Math.round(seconds / 5) * 5} seconds left`;
  const m = Math.round(seconds / 60);
  return `about ${m} minute${m > 1 ? "s" : ""} left`;
}

// Like the Windows "copying files" box: one bar for the whole batch, time
// passed, time left, and a small tile per photo.
interface Props {
  jobs: ScanJob[];
  upload: UploadProgress | null;
  resetsAt?: string;
  offsetMs: number;          // server clock minus phone clock
  startedAt: number | null;  // when this batch was started on this phone
}

export function BatchProgress({ jobs, upload, resetsAt, offsetMs, startedAt }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const local = (iso: string) => Date.parse(iso) - offsetMs; // server time → phone time

  const notUploaded = upload ? upload.total - upload.done : 0;
  const total = jobs.length + notUploaded;
  const finished = jobs.filter((j) => !isReading(j)).length;

  const times = jobs
    .filter((j) => j.startedAt && j.finishedAt && !isReading(j))
    .map((j) => (Date.parse(j.finishedAt!) - Date.parse(j.startedAt!)) / 1000);
  const perBill = times.length ? times.reduce((a, b) => a + b, 0) / times.length : DEFAULT_READ_S;

  // A bill being read counts a little more each second (up to 90%), so the bar keeps moving.
  const inFlight = jobs
    .filter((j) => j.status === "reading" && j.startedAt)
    .reduce((sum, j) => sum + Math.max(0, Math.min(0.9, (now - local(j.startedAt!)) / 1000 / perBill)), 0);
  // Google is taking much longer than usual on at least one bill.
  const slow = jobs.some((j) => j.status === "reading" && j.startedAt && (now - local(j.startedAt)) / 1000 > perBill * 1.5);
  const pct = total ? Math.min(99, Math.round(((finished + inFlight) / total) * 100)) : 0;

  const started = startedAt ?? Math.min(...jobs.map((j) => local(j.createdAt)));
  const elapsed = Number.isFinite(started) ? (now - started) / 1000 : 0;
  const left = ((total - finished - inFlight) * perBill) / AT_ONCE;

  // Free scans used up: the waiting photos continue after the refill.
  const waitingForScans = jobs.find((j) => j.status === "queued" && j.error?.startsWith("Waiting for today's free scans"));

  const title = upload
    ? `Sending photos… ${upload.done} of ${upload.total}`
    : waitingForScans
      ? "Free scans used up for today"
      : `Reading bills… ${finished} of ${total} done`;

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 shadow-card animate-rise">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="font-semibold text-clay-dark" aria-live="polite">
          {title}
        </p>
        <span className="font-display text-xl font-semibold text-ink tabular-nums">{pct}%</span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="relative h-full rounded-full bg-gradient-to-r from-clay to-gold transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }}>
          <div className="absolute inset-0 animate-pulse bg-white/20" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4" /> Time passed {clock(elapsed)}
        </span>
        <span className="font-medium text-ink">
          {waitingForScans
            ? `Continues by itself · ${resetsAt ? refillText(resetsAt) : "after the refill"}`
            : slow
              ? "Google is slow today — still working…"
              : aboutLeft(left)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8">
        {jobs.map((j) => (
          <Tile key={j.id} job={j} />
        ))}
        {Array.from({ length: notUploaded }, (_, i) => (
          <div key={`up-${i}`} className="grid aspect-square place-items-center rounded-lg border border-dashed border-line-strong text-ink-faint">
            <Spinner className="size-4" />
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-ink-soft">
        You can close the app or lock the phone — reading continues, and the bills will be waiting here for you to check.
      </p>
    </div>
  );
}

function Tile({ job }: { job: ScanJob }) {
  const badge =
    job.status === "reading" ? (
      <span className="grid size-6 place-items-center rounded-full bg-clay text-white">
        <Spinner className="size-3.5" />
      </span>
    ) : job.status === "queued" ? (
      <span className="grid size-6 place-items-center rounded-full bg-ink/60 text-white">
        <Clock className="size-3.5" />
      </span>
    ) : job.status === "failed" ? (
      <span className="grid size-6 place-items-center rounded-full bg-rust text-white">
        <X className="size-3.5" />
      </span>
    ) : (
      <span className={`grid size-6 place-items-center rounded-full text-white ${job.status === "check" ? "bg-gold" : "bg-leaf"}`}>
        <Check className="size-3.5" />
      </span>
    );
  return (
    <div className={`relative aspect-square overflow-hidden rounded-lg border border-line bg-[#efe6d8] ${isReading(job) ? "" : "opacity-90"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/scan-jobs/${job.id}/photo?thumb=1`} alt="" loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute right-1 bottom-1">{badge}</span>
    </div>
  );
}
