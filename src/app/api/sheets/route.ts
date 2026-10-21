import { NextRequest, NextResponse } from "next/server";
import { getCompany } from "@/lib/companies";
import { pingSheet, sheetsConfigured } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  const company = getCompany(req.nextUrl.searchParams.get("company")).id;
  if (!sheetsConfigured(company)) return NextResponse.json({ ok: false, message: "Google Sheet link is not set up yet" });
  try {
    return NextResponse.json({ ok: true, message: await pingSheet(company) });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Could not reach the sheet" });
  }
}
