import { NextRequest, NextResponse, after } from "next/server";
import { getCompany } from "@/lib/companies";
import { latestBillMonth, listBills, monthStats, unmatchedPurchases } from "@/lib/db";
import { creditsLeft } from "@/lib/quota";
import { retryUnsynced, sheetLink, sheetsConfigured } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const company = getCompany(p.get("company")).id;
  const asked = p.get("month");
  const month = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : (await latestBillMonth(company)) ?? new Date().toISOString().slice(0, 7);
  const [stats, recent, unmatched, credits] = await Promise.all([
    monthStats(company, month),
    listBills({ company, limit: 6, newestSavedFirst: true }),
    unmatchedPurchases(company),
    creditsLeft(),
  ]);
  after(retryUnsynced);
  return NextResponse.json({
    stats,
    recent,
    unmatched,
    credits,
    sheetUrl: sheetLink(company),
    sheetsConfigured: sheetsConfigured(company),
  });
}
