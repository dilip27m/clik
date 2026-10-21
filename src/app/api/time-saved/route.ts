import { NextResponse } from "next/server";
import { allBillTimings } from "@/lib/db";
import { savedSeconds } from "@/lib/time-saved";

// Total time the app has saved, across both companies.
export async function GET() {
  const bills = await allBillTimings();
  const seconds = bills.reduce((sum, b) => sum + savedSeconds(b), 0);
  return NextResponse.json({ bills: bills.length, seconds });
}
