import { NextRequest, NextResponse } from "next/server";
import { getBill, getPhoto } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const photo = await getPhoto(id);
  if (photo) {
    return new NextResponse(new Uint8Array(photo.data), {
      headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=86400" },
    });
  }
  // Already moved to Google Drive: show Drive's image of it.
  const bill = await getBill(id);
  const fileId = bill?.photoUrl?.match(/\/d\/([\w-]+)/)?.[1];
  if (!fileId) return NextResponse.json({ error: "No photo" }, { status: 404 });
  return NextResponse.redirect(`https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`);
}
