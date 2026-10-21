import { NextResponse } from "next/server";
import { pingSheet, sheetsConfigured } from "@/lib/sheets";

export async function POST() {
  if (!sheetsConfigured()) return NextResponse.json({ ok: false, message: "Google Sheet link is not set up yet" });
  try {
    return NextResponse.json({ ok: true, message: await pingSheet() });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Could not reach the sheet" });
  }
}
