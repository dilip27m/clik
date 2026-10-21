import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, checkLogin, createSessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username = "", password = "" } = await req.json().catch(() => ({}));
  if (!checkLogin(String(username), String(password))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.json({ error: "User name or password is wrong" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
