import { NextRequest, NextResponse, after } from "next/server";
import { BILL_TYPES, Timings, checkBill, cleanBillData, isBillType } from "@/lib/bill-types";

const TIMING_KEYS = ["prepareMs", "uploadMs", "aiMs", "reviewMs"] as const;

// Only accept sensible numbers from the phone.
function cleanTimings(raw: unknown): Timings {
  const t: Timings = {};
  if (!raw || typeof raw !== "object") return t;
  const r = raw as Record<string, unknown>;
  for (const k of TIMING_KEYS) {
    const v = Number(r[k]);
    if (Number.isFinite(v) && v >= 0 && v < 24 * 3600 * 1000) t[k] = Math.round(v);
  }
  if (r.manual === true) t.manual = true;
  return t;
}
import { getCompany } from "@/lib/companies";
import { DuplicateBillError, createBill, listBills, saveDbTime } from "@/lib/db";
import { retryUnsynced, syncBill } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const type = p.get("type");
  const bills = await listBills({
    company: getCompany(p.get("company")).id,
    type: isBillType(type) ? type : undefined,
    month: p.get("month") || undefined,
    search: p.get("q") || undefined,
  });
  after(retryUnsynced);
  return NextResponse.json({ bills });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const type: unknown = body.type;
  if (!isBillType(type)) return NextResponse.json({ error: "Unknown bill type" }, { status: 400 });
  const company = getCompany(body.company).id;

  const def = BILL_TYPES[type];
  const data = cleanBillData(type, body.data || {});
  if (!data[def.keyField]) {
    const label = def.fields.find((f) => f.key === def.keyField)!.label;
    return NextResponse.json({ error: `${label} is needed to save` }, { status: 400 });
  }
  if (!data.date) return NextResponse.json({ error: "Date is needed to save" }, { status: 400 });

  const photo =
    typeof body.photo === "string" && body.photo.length > 1000
      ? { mime: body.mime || "image/jpeg", data: Buffer.from(body.photo.replace(/^data:[^;]+;base64,/, ""), "base64") }
      : undefined;

  const timings = cleanTimings(body.timings);
  try {
    const dbStart = Date.now();
    const bill = await createBill(company, type, data, photo, timings);
    const dbMs = Date.now() - dbStart;
    bill.timings = { ...timings, dbMs };
    after(() => saveDbTime(bill.id, dbMs));
    after(() => syncBill(bill.id));
    return NextResponse.json({ bill, checks: checkBill(type, data) });
  } catch (e) {
    if (e instanceof DuplicateBillError) {
      return NextResponse.json({ error: "This bill is already saved", existingId: e.existingId }, { status: 409 });
    }
    throw e;
  }
}
