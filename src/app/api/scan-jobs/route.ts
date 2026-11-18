import { NextRequest, NextResponse, after } from "next/server";
import { getCompany } from "@/lib/companies";
import { createJob, listJobs } from "@/lib/jobs";
import { creditsLeft } from "@/lib/quota";
import { startReader, startReaderIfNeeded } from "@/lib/reader";

// The current batch: every photo not yet confirmed or rejected.
// Also restarts the background reader if it stopped (e.g. the next day after
// free scans refilled).
export async function GET(req: NextRequest) {
  const company = getCompany(req.nextUrl.searchParams.get("company")).id;
  const [{ jobs, now }, credits] = await Promise.all([listJobs(company), creditsLeft()]);
  after(() => startReaderIfNeeded(req.nextUrl.origin));
  return NextResponse.json({ jobs, credits, now });
}

// Adds one photo to the batch and wakes the background reader.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.image !== "string" || body.image.length < 1000) {
    return NextResponse.json({ error: "No photo received" }, { status: 400 });
  }
  const company = getCompany(body.company).id;
  const data = Buffer.from(body.image.replace(/^data:[^;]+;base64,/, ""), "base64");
  const blurry = typeof body.blurry === "string" && body.blurry ? body.blurry : undefined;
  const job = await createJob(company, { mime: typeof body.mime === "string" ? body.mime : "image/jpeg", data }, blurry);
  if (!blurry) after(() => startReader(req.nextUrl.origin));
  return NextResponse.json({ job });
}
