import { NextRequest, NextResponse } from "next/server";
import { BILL_TYPES } from "@/lib/bill-types";
import { getCompany } from "@/lib/companies";
import { findBill } from "@/lib/db";
import { extractBill } from "@/lib/extractor";
import { creditsLeft } from "@/lib/quota";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { image, mime, company: active } = await req.json().catch(() => ({}));
  if (typeof image !== "string" || image.length < 1000) {
    return NextResponse.json({ ok: false, reason: "No photo received. Please try again." }, { status: 400 });
  }
  const base64 = image.replace(/^data:[^;]+;base64,/, "");
  const result = await extractBill(base64, typeof mime === "string" ? mime : "image/jpeg");
  const credits = await creditsLeft();

  // The company printed on the bill wins; otherwise the one selected in the app.
  const found = result.ok ? result : result.draft;
  if (found) found.company = found.company ?? getCompany(active).id;
  const docNo = found ? String(found.data[BILL_TYPES[found.type].keyField] ?? "") : "";
  const existingId = found && docNo ? await findBill(found.company!, found.type, docNo).catch(() => null) : null;
  return NextResponse.json({ ...result, existingId, credits });
}
