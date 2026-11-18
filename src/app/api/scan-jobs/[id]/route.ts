import { NextRequest, NextResponse } from "next/server";
import { deleteJob } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

// Reject: the photo is dropped and nothing is saved.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  await deleteJob(Number((await ctx.params).id));
  return NextResponse.json({ ok: true });
}
