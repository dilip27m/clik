import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getJobPhoto } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

// The photo, or with ?thumb=1 a small copy for lists (about 15 KB instead of 300 KB).
export async function GET(req: NextRequest, ctx: Ctx) {
  const photo = await getJobPhoto(Number((await ctx.params).id));
  if (!photo) return NextResponse.json({ error: "No photo" }, { status: 404 });
  const headers = { "Cache-Control": "private, max-age=86400" };
  if (req.nextUrl.searchParams.has("thumb")) {
    const small = await sharp(photo.data).resize(240, 240, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();
    return new NextResponse(new Uint8Array(small), { headers: { ...headers, "Content-Type": "image/jpeg" } });
  }
  return new NextResponse(new Uint8Array(photo.data), { headers: { ...headers, "Content-Type": photo.mime } });
}
