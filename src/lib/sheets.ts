import "server-only";
import { BILL_TYPES, Bill } from "./bill-types";
import { COMPANIES, DEFAULT_COMPANY } from "./companies";
import { getBill, getPhoto, markSyncFailed, markSynced, unsyncedBillIds } from "./db";

// Each company has its own Google Sheet (and its own Apps Script web app):
//   GOOGLE_SHEETS_WEBHOOK_URL_SLP, GOOGLE_SHEETS_WEBHOOK_URL_RENUKA, …
// The first company may also use the plain GOOGLE_SHEETS_WEBHOOK_URL.
function companyEnv(prefix: string, company: string): string {
  const own = process.env[`${prefix}_${company.toUpperCase()}`];
  const fallback = company === DEFAULT_COMPANY ? process.env[prefix] : "";
  return (own || fallback || "").trim();
}

const webhookUrl = (company: string) => companyEnv("GOOGLE_SHEETS_WEBHOOK_URL", company);

// Link to open the company's sheet: GOOGLE_SHEET_URL_SLP, GOOGLE_SHEET_URL_RENUKA, …
export const sheetLink = (company: string) =>
  companyEnv("GOOGLE_SHEET_URL", company) ||
  (company === DEFAULT_COMPANY ? process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL || null : null);

export function sheetsConfigured(company: string): boolean {
  return Boolean(webhookUrl(company));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(company: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(webhookUrl(company), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token: process.env.SHEETS_TOKEN || "" }),
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Google Sheet replied with something unexpected (${res.status})`);
  }
  if (!json.success) throw new Error(json.error || "Google Sheet refused the update");
  return json;
}

// Sends one bill (and its photo, the first time) to its company's Google Sheet.
export async function syncBill(id: number): Promise<void> {
  const bill = await getBill(id);
  if (!bill || !sheetsConfigured(bill.company)) return;
  try {
    const def = BILL_TYPES[bill.type];
    const photo = bill.photoUrl ? null : await getPhoto(id);
    const started = Date.now();
    const result = await post(bill.company, {
      action: "upsert",
      tab: def.sheetTab,
      key: bill.docNo,
      columns: def.fields.map((f) => ({ label: f.label, kind: f.kind })),
      values: def.fields.map((f) => bill.data[f.key] ?? ""),
      photo: photo && {
        base64: photo.data.toString("base64"),
        mime: photo.mime,
        name: `${def.name} ${bill.docNo.replace(/[\\/]/g, "-")}.jpg`,
      },
    });
    const firstSync = bill.timings.sheetMs === undefined;
    await markSynced(id, result.photoUrl || null, firstSync ? Date.now() - started : undefined);
  } catch (e) {
    console.warn(`[sheets] bill ${id} failed:`, e instanceof Error ? e.message : e);
    await markSyncFailed(id);
  }
}

export async function syncDelete(bill: Bill): Promise<void> {
  if (!sheetsConfigured(bill.company)) return;
  try {
    await post(bill.company, { action: "delete", tab: BILL_TYPES[bill.type].sheetTab, key: bill.docNo });
  } catch (e) {
    console.warn(`[sheets] delete ${bill.docNo} failed:`, e instanceof Error ? e.message : e);
  }
}

// Picks up bills whose sync failed earlier (e.g. no internet) and tries again.
export async function retryUnsynced(): Promise<void> {
  const connected = COMPANIES.map((c) => c.id).filter(sheetsConfigured);
  if (!connected.length) return;
  for (const id of await unsyncedBillIds(connected, 3)) await syncBill(id);
}

export async function pingSheet(company: string): Promise<string> {
  const json = await post(company, { action: "ping" });
  return json.message;
}
