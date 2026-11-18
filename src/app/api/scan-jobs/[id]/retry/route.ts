import { NextRequest, NextResponse, after } from "next/server";
import { retryJob } from "@/lib/jobs";
import { startReader } from "@/lib/reader";

type Ctx = { params: Promise<{ id: string }> };

// "Retry" / "Read anyway": puts the photo back in line to be read again.
export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await retryJob(Number((await ctx.params).id)))) {
    return NextResponse.json({ error: "This photo is already being read" }, { status: 409 });
  }
  after(() => startReader(req.nextUrl.origin));
  return NextResponse.json({ ok: true });
}
