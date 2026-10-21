import { NextRequest, NextResponse, after } from "next/server";
import { cleanBillData } from "@/lib/bill-types";
import { DuplicateBillError, deleteBill, getBill, matchingBills, updateBill } from "@/lib/db";
import { sheetsConfigured, syncBill, syncDelete } from "@/lib/sheets";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const bill = await getBill(Number((await ctx.params).id));
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  return NextResponse.json({ bill, matches: await matchingBills(bill), sheetsConfigured: sheetsConfigured() });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const current = await getBill(id);
  if (!current) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const data = cleanBillData(current.type, body.data || {});
  try {
    const bill = await updateBill(id, data);
    // If the bill number changed, remove the old row from the sheet first.
    if (bill && bill.docNo !== current.docNo) after(() => syncDelete(current).then(() => syncBill(id)));
    else after(() => syncBill(id));
    return NextResponse.json({ bill });
  } catch (e) {
    if (e instanceof DuplicateBillError) {
      return NextResponse.json({ error: "Another bill already has this number", existingId: e.existingId }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const bill = await deleteBill(Number((await ctx.params).id));
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  after(() => syncDelete(bill));
  return NextResponse.json({ ok: true });
}
