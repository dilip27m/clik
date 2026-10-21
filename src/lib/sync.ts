import "server-only";
import { BILL_TYPES, BILL_TYPE_ORDER, BillData, cleanBillData } from "./bill-types";
import { createBill, findBill, listBills, markManySynced, markSynced } from "./db";
import { post, sheetsConfigured, syncBill } from "./sheets";

export interface SyncResult {
  addedToApp: number;    // rows found only in the sheet
  sheetAdded: number;    // app bills that were missing from the sheet
  sheetUpdated: number;  // app bills rewritten in the sheet
  photosSent: number;    // photos that were still waiting to go to Drive
}

const BATCH = 150;

// "Sync" button: makes the app and the company's Google Sheet hold the same bills.
// 1. Rows that exist only in the sheet are added to the app (with their Drive photo link).
// 2. Every app bill is written to the sheet in batches; the app's values win.
// Nothing is deleted on either side.
export async function syncCompany(company: string): Promise<SyncResult> {
  if (!sheetsConfigured(company)) throw new Error("This company's Google Sheet is not connected yet.");

  const tabs = BILL_TYPE_ORDER.map((t) => BILL_TYPES[t].sheetTab);
  let listed;
  try {
    listed = await post(company, { action: "list", tabs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown action/i.test(msg)) {
      throw new Error("The Google Sheet script is an older version. Paste the new Code.gs into the sheet and deploy a new version.");
    }
    throw e;
  }

  // 1. Sheet → app
  let addedToApp = 0;
  for (const type of BILL_TYPE_ORDER) {
    const def = BILL_TYPES[type];
    const tab = listed.tabs?.[def.sheetTab] as { headers: string[]; rows: unknown[][] } | undefined;
    if (!tab?.rows.length) continue;
    const photoCol = tab.headers.indexOf("Photo");
    for (const row of tab.rows) {
      const raw: Record<string, unknown> = {};
      for (const f of def.fields) {
        const col = tab.headers.indexOf(f.label);
        if (col >= 0) raw[f.key] = row[col];
      }
      const data: BillData = cleanBillData(type, raw);
      const docNo = String(data[def.keyField] ?? "");
      if (!docNo || !data.date || (await findBill(company, type, docNo))) continue;
      const bill = await createBill(company, type, data);
      const photoUrl = photoCol >= 0 ? String(row[photoCol] || "") : "";
      await markSynced(bill.id, photoUrl || null);
      addedToApp++;
    }
  }

  // 2. App → sheet
  const bills = await listBills({ company, limit: 2000 });
  let sheetAdded = 0;
  let sheetUpdated = 0;
  for (let i = 0; i < bills.length; i += BATCH) {
    const chunk = bills.slice(i, i + BATCH);
    const res = await post(company, {
      action: "bulkUpsert",
      items: chunk.map((b) => {
        const def = BILL_TYPES[b.type];
        return {
          tab: def.sheetTab,
          key: b.docNo,
          columns: def.fields.map((f) => ({ label: f.label, kind: f.kind })),
          values: def.fields.map((f) => b.data[f.key] ?? ""),
        };
      }),
    });
    sheetAdded += res.added ?? 0;
    sheetUpdated += res.updated ?? 0;
  }

  // Photos not yet in Drive go one by one (they carry the image).
  const waiting = bills.filter((b) => b.hasPhoto && !b.photoUrl);
  for (const b of waiting) await syncBill(b.id);
  await markManySynced(bills.filter((b) => !waiting.includes(b)).map((b) => b.id));

  return { addedToApp, sheetAdded, sheetUpdated, photosSent: waiting.length };
}
