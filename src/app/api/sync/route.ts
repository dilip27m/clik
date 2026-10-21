import { NextRequest, NextResponse } from "next/server";
import { getCompany } from "@/lib/companies";
import { syncCompany } from "@/lib/sync";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const company = getCompany(req.nextUrl.searchParams.get("company")).id;
  try {
    return NextResponse.json({ ok: true, ...(await syncCompany(company)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}
