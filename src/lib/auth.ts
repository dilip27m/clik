// Tiny login: company name + 4-digit password, kept in a signed cookie.
// Uses Web Crypto so it works both in route handlers and in proxy.ts.

export const SESSION_COOKIE = "slp_session";
export const SESSION_DAYS = 90;

const enc = new TextEncoder();

function secret(): string {
  return process.env.AUTH_SECRET || `${process.env.APP_COMPANY_NAME}:${process.env.APP_PASSWORD}:slp`;
}

async function hmac(text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  return `${expires}.${await hmac(String(expires))}`;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return (await hmac(expires)) === sig;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function checkLogin(company: string, password: string): boolean {
  const wantCompany = process.env.APP_COMPANY_NAME || "";
  const wantPassword = process.env.APP_PASSWORD || "";
  if (!wantCompany || !wantPassword) return false;
  return normalize(company) === normalize(wantCompany) && password.trim() === wantPassword.trim();
}
