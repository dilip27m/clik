import { NextRequest, NextResponse, after } from "next/server";
import { getCompany } from "@/lib/companies";
import { listBills } from "@/lib/db";
import { jobCounts } from "@/lib/jobs";
import { creditsLeft } from "@/lib/quota";
import { retryUnsynced, sheetLink, sheetsConfigured } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const company = getCompany(p.get("company")).id;
  const [recent, credits, batch] = await Promise.all([
    listBills({ company, limit: 6, newestSavedFirst: true }),
    creditsLeft(),
    jobCounts(company),
  ]);
  after(retryUnsynced);
  return NextResponse.json({
    recent,
    credits,
    batch,
    sheetUrl: sheetLink(company),
    sheetsConfigured: sheetsConfigured(company),
  });
}
