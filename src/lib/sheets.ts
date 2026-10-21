import "server-only";
import { BILL_TYPES, Bill } from "./bill-types";
import { getBill, getPhoto, markSyncFailed, markSynced, unsyncedBillIds } from "./db";

function webhookUrl(): string {
  return (process.env.GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
}

export function sheetsConfigured(): boolean {
  return Boolean(webhookUrl());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(webhookUrl(), {
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

// Sends one bill (and its photo, the first time) to the Google Sheet.
export async function syncBill(id: number): Promise<void> {
  if (!sheetsConfigured()) return;
  const bill = await getBill(id);
  if (!bill) return;
  try {
    const def = BILL_TYPES[bill.type];
    const photo = bill.photoUrl ? null : await getPhoto(id);
    const result = await post({
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
    await markSynced(id, result.photoUrl || null);
  } catch (e) {
    console.warn(`[sheets] bill ${id} failed:`, e instanceof Error ? e.message : e);
    await markSyncFailed(id);
  }
}

export async function syncDelete(bill: Bill): Promise<void> {
  if (!sheetsConfigured()) return;
  try {
    await post({ action: "delete", tab: BILL_TYPES[bill.type].sheetTab, key: bill.docNo });
  } catch (e) {
    console.warn(`[sheets] delete ${bill.docNo} failed:`, e instanceof Error ? e.message : e);
  }
}

// Picks up bills whose sync failed earlier (e.g. no internet) and tries again.
export async function retryUnsynced(): Promise<void> {
  if (!sheetsConfigured()) return;
  for (const id of await unsyncedBillIds(3)) await syncBill(id);
}

export async function pingSheet(): Promise<string> {
  const json = await post({ action: "ping" });
  return json.message;
}
