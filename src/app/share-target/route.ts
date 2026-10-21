import { NextRequest, NextResponse } from "next/server";

// The service worker normally catches shared photos before they get here.
// If it isn't running yet (first visit), just open the Scan page.
export async function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/scan", req.url), 303);
}
