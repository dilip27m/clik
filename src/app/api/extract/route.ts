import { NextRequest, NextResponse } from "next/server";
import { BILL_TYPES } from "@/lib/bill-types";
import { findBill } from "@/lib/db";
import { extractBill } from "@/lib/extractor";
import { creditsLeft } from "@/lib/quota";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { image, mime } = await req.json().catch(() => ({}));
  if (typeof image !== "string" || image.length < 1000) {
    return NextResponse.json({ ok: false, reason: "No photo received. Please try again." }, { status: 400 });
  }
  const base64 = image.replace(/^data:[^;]+;base64,/, "");
  const result = await extractBill(base64, typeof mime === "string" ? mime : "image/jpeg");
  const credits = await creditsLeft();
  const found = result.ok ? result : result.draft;
  const docNo = found ? String(found.data[BILL_TYPES[found.type].keyField] ?? "") : "";
  const existingId = found && docNo ? await findBill(found.type, docNo).catch(() => null) : null;
  return NextResponse.json({ ...result, existingId, credits });
}
