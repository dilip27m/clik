import "server-only";
import { WORKER_HEADER, workerKey } from "./auth";
import { BILL_TYPES } from "./bill-types";
import { findBill } from "./db";
import { extractBill } from "./extractor";
import { claimJobs, finishJob, readerNeeded, requeueJob } from "./jobs";

// Background bill reader. Each run reads a couple of photos, then calls itself
// again while photos are waiting, so a batch keeps going on the server even if
// the phone is closed. Google's free tier limits requests per minute, hence
// only a few at a time.
//
// Nobody is watching a spinner here, so each try gives one model the full
// time instead of rushing, and the next try uses the next model. A photo is
// only marked "failed" after AUTO_TRIES busy/slow answers.
const AT_ONCE = 2;
const AUTO_TRIES = 6;
const READ_BUDGET_MS = 48000; // fits inside one 60 s server run

type Claimed = Awaited<ReturnType<typeof claimJobs>>[number];

async function readOne(job: Claimed) {
  try {
    const r = await extractBill(job.photo.toString("base64"), job.mime, {
      budgetMs: READ_BUDGET_MS,
      perModelMs: READ_BUDGET_MS,
      rotate: job.attempts - 1,
    });
    const found = r.ok ? r : r.draft;
    if (found) found.company = found.company ?? job.company;
    const docNo = found ? String(found.data[BILL_TYPES[found.type].keyField] ?? "") : "";
    const existingId = found && docNo ? await findBill(found.company!, found.type, docNo) : null;

    if (r.ok) return finishJob(job.id, { status: "ready", result: r, existingId });
    if (r.retake) return finishJob(job.id, { status: "check", result: r.draft ?? null, error: r.reason, existingId });
    if (r.outOfCredits) {
      // Wait for the free scans to refill; this try doesn't count.
      const at = new Date(r.resetsAt ?? Date.now() + 3600_000);
      return requeueJob(job.id, at, "Waiting for today's free scans to refill", false);
    }
    return retryLater(job, r.reason);
  } catch (e) {
    return retryLater(job, e instanceof Error ? e.message : "Could not read the bill");
  }
}

function retryLater(job: Claimed, reason: string) {
  if (job.attempts >= AUTO_TRIES) return finishJob(job.id, { status: "failed", error: reason });
  // Wait a little longer after each busy answer: 15 s, 30 s, 45 s, then 60 s.
  return requeueJob(job.id, new Date(Date.now() + Math.min(60_000, 15_000 * job.attempts)), reason);
}

/** Reads one round of photos. Returns true if it read anything. */
export async function readRound(): Promise<boolean> {
  const jobs = await claimJobs(AT_ONCE);
  if (!jobs.length) return false;
  await Promise.all(jobs.map(readOne));
  return true;
}

/** Starts a reader run on the server (returns as soon as it has started). */
export async function startReader(origin: string) {
  try {
    await fetch(`${origin}/api/scan-jobs/work`, {
      method: "POST",
      headers: { [WORKER_HEADER]: await workerKey() },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.warn("[reader] could not start:", e instanceof Error ? e.message : e);
  }
}

/** Starts a reader only when photos are waiting and none is running. */
export async function startReaderIfNeeded(origin: string) {
  if (await readerNeeded()) await startReader(origin);
}
