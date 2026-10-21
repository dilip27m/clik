import "server-only";
import { Pool as PgPool, types } from "pg";
import { Pool as NeonPool, types as neonTypes } from "@neondatabase/serverless";
import { Bill, BillData, BillType, Timings, summarize } from "./bill-types";

// Return DATE columns as plain "YYYY-MM-DD" strings and NUMERIC as numbers.
for (const t of [types, neonTypes]) {
  t.setTypeParser(1082, (v: string) => v);
  t.setTypeParser(1700, (v: string) => (v === null ? null : Number(v)));
}

// Neon is reached over HTTPS/WebSocket (port 443): it starts faster on Vercel
// and works on networks that block the normal Postgres port.
type Pool = PgPool;

const globalForDb = globalThis as unknown as { pool?: Pool; ready?: Promise<void> };

function connectionString(): string {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url.trim().replace(/^["']|["']$/g, "");
}

function getPool(): Pool {
  if (!globalForDb.pool) {
    const url = connectionString();
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    globalForDb.pool = isLocal
      ? new PgPool({ connectionString: url, max: 5 })
      : (new NeonPool({ connectionString: url, max: 5, idleTimeoutMillis: 30000 }) as unknown as Pool);
  }
  return globalForDb.pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bills (
  id           BIGSERIAL PRIMARY KEY,
  type         TEXT NOT NULL,
  doc_no       TEXT NOT NULL,
  bill_date    DATE,
  party        TEXT NOT NULL DEFAULT '',
  vehicle_no   TEXT NOT NULL DEFAULT '',
  qty          NUMERIC,
  amount       NUMERIC,
  data         JSONB NOT NULL,
  photo_url    TEXT,
  sheet_status TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, doc_no)
);
-- Each bill belongs to one company; bill numbers are unique per company.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT 'slp';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS timings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_type_doc_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS bills_company_type_doc ON bills (company, type, doc_no);
CREATE INDEX IF NOT EXISTS bills_type_date ON bills (type, bill_date DESC);
CREATE INDEX IF NOT EXISTS bills_vehicle ON bills (vehicle_no);

-- Photos are kept here only until they are copied to Google Drive.
CREATE TABLE IF NOT EXISTS bill_photos (
  bill_id BIGINT PRIMARY KEY REFERENCES bills(id) ON DELETE CASCADE,
  mime    TEXT NOT NULL,
  data    BYTEA NOT NULL
);

-- Free-tier AI requests used per model per (Pacific) day.
CREATE TABLE IF NOT EXISTS ai_usage (
  day       TEXT NOT NULL,
  model     TEXT NOT NULL,
  used      INT NOT NULL DEFAULT 0,
  exhausted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (day, model)
);
`;

async function db(): Promise<Pool> {
  const pool = getPool();
  if (!globalForDb.ready) {
    globalForDb.ready = pool.query(SCHEMA).then(() => undefined);
    globalForDb.ready.catch(() => (globalForDb.ready = undefined));
  }
  await globalForDb.ready;
  return pool;
}

const SELECT = `
  SELECT b.id, b.company, b.type, b.doc_no, b.bill_date, b.party, b.vehicle_no, b.qty, b.amount, b.data,
         b.photo_url, b.sheet_status, b.created_at, b.timings,
         (b.photo_url IS NOT NULL OR EXISTS (SELECT 1 FROM bill_photos p WHERE p.bill_id = b.id)) AS has_photo
  FROM bills b`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBill(r: any): Bill {
  return {
    id: Number(r.id),
    company: r.company,
    type: r.type,
    docNo: r.doc_no,
    date: r.bill_date ?? "",
    party: r.party,
    vehicleNo: r.vehicle_no,
    qty: r.qty,
    amount: r.amount,
    data: r.data,
    hasPhoto: Boolean(r.has_photo),
    photoUrl: r.photo_url,
    sheetStatus: r.sheet_status,
    timings: r.timings ?? {},
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export class DuplicateBillError extends Error {
  constructor(public existingId: number) {
    super("This bill is already saved");
  }
}

export interface ListFilter {
  company: string;
  type?: BillType;
  month?: string;   // YYYY-MM
  search?: string;
  limit?: number;
}

export async function listBills(f: ListFilter): Promise<Bill[]> {
  const pool = await db();
  const where: string[] = ["b.company = $1"];
  const args: unknown[] = [f.company];
  if (f.type) {
    args.push(f.type);
    where.push(`b.type = $${args.length}`);
  }
  if (f.month && /^\d{4}-\d{2}$/.test(f.month)) {
    args.push(`${f.month}-01`);
    where.push(`b.bill_date >= $${args.length}::date AND b.bill_date < ($${args.length}::date + interval '1 month')`);
  }
  if (f.search?.trim()) {
    args.push(`%${f.search.trim()}%`);
    where.push(`(b.doc_no ILIKE $${args.length} OR b.party ILIKE $${args.length} OR b.vehicle_no ILIKE $${args.length})`);
  }
  args.push(Math.min(f.limit ?? 500, 2000));
  const sql = `${SELECT} WHERE ${where.join(" AND ")}
    ORDER BY b.bill_date DESC NULLS LAST, b.id DESC LIMIT $${args.length}`;
  const { rows } = await pool.query(sql, args);
  return rows.map(toBill);
}

export async function getBill(id: number): Promise<Bill | null> {
  const pool = await db();
  const { rows } = await pool.query(`${SELECT} WHERE b.id = $1`, [id]);
  return rows[0] ? toBill(rows[0]) : null;
}

export async function findBill(company: string, type: BillType, docNo: string): Promise<number | null> {
  const pool = await db();
  const { rows } = await pool.query(`SELECT id FROM bills WHERE company = $1 AND type = $2 AND doc_no = $3`, [
    company,
    type,
    docNo,
  ]);
  return rows[0] ? Number(rows[0].id) : null;
}

export async function createBill(
  company: string,
  type: BillType,
  data: BillData,
  photo?: { mime: string; data: Buffer },
  timings: Timings = {}
): Promise<Bill> {
  const pool = await db();
  const s = summarize(type, data);
  // Bill + photo in one statement (one round trip to the database).
  const { rows } = await pool.query(
    `WITH b AS (
       INSERT INTO bills (type, doc_no, bill_date, party, vehicle_no, qty, amount, data, company, timings)
       VALUES ($1, $2, NULLIF($3, '')::date, $4, $5, $6, $7, $8, $11, $12)
       ON CONFLICT (company, type, doc_no) DO NOTHING
       RETURNING *
     ), p AS (
       INSERT INTO bill_photos (bill_id, mime, data)
       SELECT id, $9, $10 FROM b WHERE $10::bytea IS NOT NULL
     )
     SELECT b.*, ($10::bytea IS NOT NULL) AS has_photo FROM b`,
    [type, s.docNo, s.date, s.party, s.vehicleNo, s.qty, s.amount, data, photo?.mime ?? null, photo?.data ?? null, company, timings]
  );
  if (!rows[0]) throw new DuplicateBillError((await findBill(company, type, s.docNo)) ?? 0);
  return toBill(rows[0]);
}

// `company` moves the bill to the other company (and its sheet).
export async function updateBill(id: number, data: BillData, company?: string): Promise<Bill | null> {
  const pool = await db();
  const current = await getBill(id);
  if (!current) return null;
  const s = summarize(current.type, data);
  const target = company ?? current.company;
  if (s.docNo !== current.docNo || target !== current.company) {
    const other = await findBill(target, current.type, s.docNo);
    if (other && other !== id) throw new DuplicateBillError(other);
  }
  await pool.query(
    `UPDATE bills SET doc_no = $2, bill_date = NULLIF($3, '')::date, party = $4, vehicle_no = $5,
       qty = $6, amount = $7, data = $8, company = $9, sheet_status = 'pending', updated_at = now()
     WHERE id = $1`,
    [id, s.docNo, s.date, s.party, s.vehicleNo, s.qty, s.amount, data, target]
  );
  return getBill(id);
}

export async function allBillTimings(): Promise<Pick<Bill, "type" | "timings">[]> {
  const pool = await db();
  const { rows } = await pool.query(`SELECT type, timings FROM bills`);
  return rows.map((r) => ({ type: r.type, timings: r.timings ?? {} }));
}

export async function saveDbTime(id: number, dbMs: number) {
  const pool = await db();
  await pool.query(`UPDATE bills SET timings = timings || jsonb_build_object('dbMs', $2::int) WHERE id = $1`, [id, dbMs]);
}

export async function deleteBill(id: number): Promise<Bill | null> {
  const pool = await db();
  const bill = await getBill(id);
  if (!bill) return null;
  await pool.query(`DELETE FROM bills WHERE id = $1`, [id]);
  return bill;
}

export async function getPhoto(id: number): Promise<{ mime: string; data: Buffer } | null> {
  const pool = await db();
  const { rows } = await pool.query(`SELECT mime, data FROM bill_photos WHERE bill_id = $1`, [id]);
  return rows[0] ? { mime: rows[0].mime, data: rows[0].data } : null;
}

export async function markSynced(id: number, photoUrl: string | null, sheetMs?: number) {
  const pool = await db();
  await pool.query(
    `UPDATE bills SET sheet_status = 'synced', photo_url = COALESCE($2, photo_url),
       timings = CASE WHEN $3::int IS NULL THEN timings ELSE timings || jsonb_build_object('sheetMs', $3::int) END
     WHERE id = $1`,
    [id, photoUrl, sheetMs ?? null]
  );
  // Once the photo lives in Google Drive we no longer need our copy.
  if (photoUrl) await pool.query(`DELETE FROM bill_photos WHERE bill_id = $1`, [id]);
}

export async function markSyncFailed(id: number) {
  const pool = await db();
  await pool.query(`UPDATE bills SET sheet_status = 'failed' WHERE id = $1`, [id]);
}

export async function unsyncedBillIds(companies: string[], limit = 5): Promise<number[]> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT id FROM bills
     WHERE company = ANY($2) AND sheet_status <> 'synced' AND updated_at < now() - interval '1 minute'
     ORDER BY updated_at LIMIT $1`,
    [limit, companies]
  );
  return rows.map((r) => Number(r.id));
}

export async function getModelUsage(day: string): Promise<Record<string, { used: number; exhausted: boolean }>> {
  const pool = await db();
  const { rows } = await pool.query(`SELECT model, used, exhausted FROM ai_usage WHERE day = $1`, [day]);
  return Object.fromEntries(rows.map((r) => [r.model, { used: r.used, exhausted: r.exhausted }]));
}

export async function incrementModelUse(day: string, model: string) {
  const pool = await db();
  await pool.query(
    `INSERT INTO ai_usage (day, model, used) VALUES ($1, $2, 1)
     ON CONFLICT (day, model) DO UPDATE SET used = ai_usage.used + 1`,
    [day, model]
  );
}

export async function setModelExhausted(day: string, model: string) {
  const pool = await db();
  await pool.query(
    `INSERT INTO ai_usage (day, model, exhausted) VALUES ($1, $2, true)
     ON CONFLICT (day, model) DO UPDATE SET exhausted = true`,
    [day, model]
  );
}

export interface MonthStats {
  month: string;
  byType: Record<BillType, { count: number; qty: number; amount: number; gst: number }>;
}

export async function monthStats(company: string, month: string): Promise<MonthStats> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT type, count(*)::int AS count, COALESCE(sum(qty), 0) AS qty, COALESCE(sum(amount), 0) AS amount,
            COALESCE(sum(COALESCE((data->>'cgst')::numeric, 0) + COALESCE((data->>'sgst')::numeric, 0)), 0) AS gst
     FROM bills
     WHERE company = $2 AND bill_date >= $1::date AND bill_date < ($1::date + interval '1 month')
     GROUP BY type`,
    [`${month}-01`, company]
  );
  const empty = { count: 0, qty: 0, amount: 0, gst: 0 };
  const byType = {
    transit_in: { ...empty },
    apmdc_invoice: { ...empty },
    form_e: { ...empty },
    sales_invoice: { ...empty },
  } as MonthStats["byType"];
  for (const r of rows) {
    if (r.type in byType) byType[r.type as BillType] = { count: r.count, qty: r.qty, amount: r.amount, gst: r.gst };
  }
  return { month, byType };
}

// Every APMDC bill should have a Transit Form for the same truck, day and quantity.
// Returns the bills on either side that have no partner.
export async function unmatchedPurchases(company: string): Promise<Bill[]> {
  const pool = await db();
  const { rows } = await pool.query(
    `${SELECT}
     WHERE b.company = $1 AND b.type IN ('apmdc_invoice', 'transit_in')
       AND b.bill_date >= now() - interval '60 days'
       AND NOT EXISTS (
         SELECT 1 FROM bills o
         WHERE o.company = b.company AND o.type = CASE b.type WHEN 'apmdc_invoice' THEN 'transit_in' ELSE 'apmdc_invoice' END
           AND o.vehicle_no = b.vehicle_no AND o.vehicle_no <> ''
           AND o.qty = b.qty
           AND abs(o.bill_date - b.bill_date) <= 1)
       AND b.created_at < now() - interval '2 days'
     ORDER BY b.bill_date DESC LIMIT 20`,
    [company]
  );
  return rows.map(toBill);
}

// The partner bill(s) for a purchase bill: same truck, same quantity, within a day.
export async function matchingBills(bill: Bill): Promise<Bill[]> {
  if (bill.type !== "apmdc_invoice" && bill.type !== "transit_in") return [];
  if (!bill.vehicleNo || bill.qty === null || !bill.date) return [];
  const pool = await db();
  const other = bill.type === "apmdc_invoice" ? "transit_in" : "apmdc_invoice";
  const { rows } = await pool.query(
    `${SELECT}
     WHERE b.company = $5 AND b.type = $1 AND b.vehicle_no = $2 AND b.qty = $3 AND abs(b.bill_date - $4::date) <= 1
     ORDER BY b.bill_date LIMIT 5`,
    [other, bill.vehicleNo, bill.qty, bill.date, bill.company]
  );
  return rows.map(toBill);
}
