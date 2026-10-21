import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Everything except the login page/API and static files.
  matcher: ["/((?!login|api/login|_next/|favicon|icon-|apple-touch-icon|logo|manifest.webmanifest|sw.js|offline.html|share-target).*)"],
};
