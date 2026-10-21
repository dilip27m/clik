import { NextRequest, NextResponse, after } from "next/server";
import { listBills, monthStats, unmatchedPurchases } from "@/lib/db";
import { creditsLeft } from "@/lib/quota";
import { retryUnsynced, sheetsConfigured } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const [stats, recent, unmatched, credits] = await Promise.all([
    monthStats(month),
    listBills({ limit: 6 }),
    unmatchedPurchases(),
    creditsLeft(),
  ]);
  after(retryUnsynced);
  return NextResponse.json({
    stats,
    recent,
    unmatched,
    credits,
    sheetUrl: process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL || null,
    sheetsConfigured: sheetsConfigured(),
  });
}
