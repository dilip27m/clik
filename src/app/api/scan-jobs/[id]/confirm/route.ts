import { NextRequest, NextResponse, after } from "next/server";
import { BILL_TYPES, cleanBillData, isBillType } from "@/lib/bill-types";
import { getCompany } from "@/lib/companies";
import { DuplicateBillError, createBill } from "@/lib/db";
import { deleteJob, getJobPhoto } from "@/lib/jobs";
import { syncBill } from "@/lib/sheets";

type Ctx = { params: Promise<{ id: string }> };

// Confirm: the checked values become a saved bill (with the photo), the job
// is removed from the batch, and the Google Sheet is updated in the background.
export async function POST(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  const type: unknown = body.type;
  if (!isBillType(type)) return NextResponse.json({ error: "Unknown bill type" }, { status: 400 });

  const def = BILL_TYPES[type];
  const data = cleanBillData(type, body.data || {});
  if (!data[def.keyField]) {
    const label = def.fields.find((f) => f.key === def.keyField)!.label;
    return NextResponse.json({ error: `${label} is needed to save` }, { status: 400 });
  }
  if (!data.date) return NextResponse.json({ error: "Date is needed to save" }, { status: 400 });

  const photo = await getJobPhoto(id);
  if (!photo) return NextResponse.json({ error: "This photo was already saved or removed" }, { status: 404 });

  try {
    const bill = await createBill(getCompany(body.company).id, type, data, photo);
    await deleteJob(id);
    after(() => syncBill(bill.id));
    return NextResponse.json({ bill });
  } catch (e) {
    if (e instanceof DuplicateBillError) {
      return NextResponse.json({ error: "This bill is already saved", existingId: e.existingId }, { status: 409 });
    }
    throw e;
  }
}
