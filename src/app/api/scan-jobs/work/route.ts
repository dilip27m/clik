import { NextRequest, NextResponse, after } from "next/server";
import { SESSION_COOKIE, WORKER_HEADER, isValidSession, workerKey } from "@/lib/auth";
import { msUntilNextJob, readerActive } from "@/lib/jobs";
import { readRound, startReader } from "@/lib/reader";

// One run of the background bill reader. Answers at once, reads a round of
// photos after answering, then starts the next run while photos are waiting.
export const maxDuration = 60;

const KEEP_WAITING_MS = 5 * 60_000; // short retry pauses: keep going by itself
const NAP_MS = 45_000;              // longest pause inside one run

export async function POST(req: NextRequest) {
  const fromReader = req.headers.get(WORKER_HEADER) === (await workerKey());
  if (!fromReader && !(await isValidSession(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const origin = req.nextUrl.origin;
  after(async () => {
    if (await readRound()) return startReader(origin);
    // Another run is busy reading: it will carry on, this one can stop.
    if (await readerActive()) return;
    // Photos are pausing before a retry: wait here, then carry on, so the batch
    // finishes even with the app closed. A long wait (free scans refilling)
    // stops the chain; opening the app starts it again.
    const wait = await msUntilNextJob();
    if (wait === null || wait > KEEP_WAITING_MS) return;
    await new Promise((r) => setTimeout(r, Math.min(Math.max(wait + 500, 3000), NAP_MS)));
    await startReader(origin);
  });
  return NextResponse.json({ started: true }, { status: 202 });
}
