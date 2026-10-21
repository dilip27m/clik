import { NextRequest, NextResponse } from "next/server";
import { getCompany } from "@/lib/companies";
import { creditsLeft } from "@/lib/quota";
import { sheetLink, sheetsConfigured } from "@/lib/sheets";

// Small, fast answer for pages that only need scan credits and the sheet link
// (Scan and Bills) — instead of loading the whole Home summary.
export async function GET(req: NextRequest) {
  const company = getCompany(req.nextUrl.searchParams.get("company")).id;
  return NextResponse.json({
    credits: await creditsLeft(),
    sheetUrl: sheetLink(company),
    sheetsConfigured: sheetsConfigured(company),
  });
}
