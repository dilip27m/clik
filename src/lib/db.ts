import { Pool } from "pg";
import {
  TransitRecord,
  InvoiceRecord,
  MasterLogFilters,
} from "@/types/transit";
import { dateToComparable } from "@/lib/validation";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5433/transit_db?schema=public";

let pool: Pool | null = null;
let isInitialized = false; // Tables created (DDL ran) — one-time flag
let isDbHealthy = false;   // Live connection health — updated by keep-alive ping

// Fallback in-memory stores
const inMemoryTransitStore = new Map<string, TransitRecord>();
const inMemoryInvoiceStore = new Map<string, InvoiceRecord>();

const defaultLocalUrl = "postgresql://postgres:postgres@localhost:5433/transit_db?schema=public";
let activeConnString: string | null = null;

export function getPool(overrideConnStr?: string): Pool {
  const targetConn = overrideConnStr || process.env.DATABASE_URL || connectionString;
  if (!pool || (activeConnString && activeConnString !== targetConn)) {
    if (pool) {
      pool.end().catch(() => {});
    }
    const isCloud =
      targetConn.includes("sslmode=require") ||
      targetConn.includes("neon.tech") ||
      targetConn.includes("supabase.co") ||
      targetConn.includes("pooler.supabase.com");

    pool = new Pool({
      connectionString: targetConn,
      ssl: isCloud ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000, // 10s for Neon serverless wakeups
      max: 10,
    });
    activeConnString = targetConn;

    pool.on("error", (err) => {
      console.error("[PostgreSQL Pool Error]:", err.message);
      isDbHealthy = false; // Mark unhealthy on pool-level errors
    });
  }
  return pool;
}

// Keep-alive timer: Pings Neon PostgreSQL every 4 minutes to prevent it from going to sleep
// Also serves as a live health monitor — updates isDbHealthy on every ping
let keepAliveTimer: NodeJS.Timeout | null = null;
function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(async () => {
    try {
      const p = getPool();
      await p.query("SELECT 1");
      if (!isDbHealthy) {
        console.log("[Neon Keep-Alive] Database connection restored.");
      }
      isDbHealthy = true;
    } catch (e: any) {
      console.warn("[Neon Keep-Alive Ping Failed]:", e.message);
      isDbHealthy = false;
    }
  }, 4 * 60 * 1000); // 4 minutes
  if (keepAliveTimer.unref) keepAliveTimer.unref();
}

let initPromise: Promise<boolean> | null = null;

export async function initDatabase(): Promise<boolean> {
  // Tables already created — just check if connection is still alive
  if (isInitialized) {
    if (isDbHealthy) return true;

    // DB was marked unhealthy (by keep-alive or pool error) — try a quick reconnect
    try {
      const p = getPool();
      await p.query("SELECT 1");
      isDbHealthy = true;
      console.log("[Database] Reconnected to PostgreSQL after temporary outage.");
      return true;
    } catch (reconnectErr: any) {
      console.warn("[Database] Reconnect check failed:", reconnectErr.message);
      isDbHealthy = false;
      return false;
    }
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    let p = getPool();
    try {
      await p.query("SELECT 1");
    } catch (primaryErr: any) {
      console.warn(`[Database] Primary connection failed (${primaryErr.message}). Testing local fallback...`);
      const localUrl = process.env.LOCAL_DATABASE_URL || defaultLocalUrl;
      if (activeConnString !== localUrl) {
        try {
          p = getPool(localUrl);
          await p.query("SELECT 1");
          console.log(`[Database] Successfully connected to local PostgreSQL fallback: ${localUrl}`);
        } catch (localErr: any) {
          console.warn(`[Database] Local fallback also failed (${localErr.message}). Falling back to in-memory store.`);
          initPromise = null;
          isDbHealthy = false;
          return false;
        }
      } else {
        initPromise = null;
        isDbHealthy = false;
        return false;
      }
    }

  try {
    // 1. Table: transit_pass_duplicate — 6 Core Fields
    await p.query(`
      CREATE TABLE IF NOT EXISTS transit_pass_duplicate (
        stationary_no VARCHAR(255) PRIMARY KEY,
        dispatch_date VARCHAR(50),
        mdl_name_consignee_name VARCHAR(255),
        mineral_name VARCHAR(255),
        vehicle_no VARCHAR(100),
        dispatch_qty NUMERIC,
        image_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tp_dup_vehicle ON transit_pass_duplicate(vehicle_no);
      CREATE INDEX IF NOT EXISTS idx_tp_dup_date ON transit_pass_duplicate(dispatch_date);
    `);

    // 2. Table: transit_pass_original — 6 Core Fields + production_qty
    await p.query(`
      CREATE TABLE IF NOT EXISTS transit_pass_original (
        stationary_no VARCHAR(255) PRIMARY KEY,
        dispatch_date VARCHAR(50),
        mdl_name_consignee_name VARCHAR(255),
        mineral_name VARCHAR(255),
        vehicle_no VARCHAR(100),
        dispatch_qty NUMERIC,
        production_qty NUMERIC,
        image_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tp_orig_vehicle ON transit_pass_original(vehicle_no);
      CREATE INDEX IF NOT EXISTS idx_tp_orig_date ON transit_pass_original(dispatch_date);
    `);

    // 3. Table: tax_invoices (Strict 9 Fields)
    await p.query(`
      CREATE TABLE IF NOT EXISTS tax_invoices (
        invoice_no VARCHAR(255) PRIMARY KEY,
        bill_to TEXT,
        invoice_date VARCHAR(50),
        quantity NUMERIC,
        rate_per_unit NUMERIC,
        taxable_amount NUMERIC,
        cgst_amount NUMERIC,
        sgst_amount NUMERIC,
        total_amount NUMERIC,
        image_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tax_inv_date ON tax_invoices(invoice_date);
      CREATE INDEX IF NOT EXISTS idx_tax_inv_bill_to ON tax_invoices(bill_to);
    `);

    // 4. Auto-migrate legacy data from transit_records and invoices if present
    try {
      await p.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transit_records') THEN
            INSERT INTO transit_pass_duplicate (
              stationary_no, dispatch_date, mdl_name_consignee_name, mineral_name, vehicle_no, dispatch_qty, image_url, created_at, updated_at
            )
            SELECT
              stationary_no, dispatch_date, mdl_name_consignee_name, mineral_name, vehicle_no, CAST(dispatch_qty AS numeric), image_url, created_at, updated_at
            FROM transit_records
            ON CONFLICT (stationary_no) DO NOTHING;
          END IF;

          IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
            INSERT INTO tax_invoices (
              invoice_no, bill_to, invoice_date, quantity, rate_per_unit, taxable_amount, cgst_amount, sgst_amount, total_amount, image_url, created_at, updated_at
            )
            SELECT
              invoice_no, bill_to, invoice_date, CAST(quantity AS numeric), CAST(rate_per_unit AS numeric), CAST(taxable_amount AS numeric), CAST(cgst_amount AS numeric), CAST(sgst_amount AS numeric), CAST(total_amount AS numeric), image_url, created_at, updated_at
            FROM invoices
            ON CONFLICT (invoice_no) DO NOTHING;
          END IF;
        END $$;
      `);
    } catch (migErr: any) {
      console.warn("[Database Migration Notice]:", migErr.message);
    }

    isInitialized = true;
    isDbHealthy = true;
    startKeepAlive();
    console.log(
      "[Database] Initialized tables: transit_pass_duplicate, transit_pass_original, tax_invoices. Neon keep-alive active."
    );
    return true;
    } catch (err: any) {
      console.warn(
        "[Database] PostgreSQL table setup issue, falling back to in-memory store:",
        err.message
      );
      initPromise = null;
      isDbHealthy = false;
      return false;
    }
  })();

  return initPromise;
}

function mapRowToTransitRecord(row: any, defaultDocType: "transit_original" | "transit_duplicate"): TransitRecord {
  return {
    stationaryNo: row.stationary_no,
    docType: row.doc_type || defaultDocType,
    dispatchDate: row.dispatch_date || "",
    mdlNameConsigneeName: row.mdl_name_consignee_name || "",
    mineralName: row.mineral_name || "",
    vehicleNo: row.vehicle_no || "",
    dispatchQty: row.dispatch_qty !== null && row.dispatch_qty !== undefined ? parseFloat(row.dispatch_qty) : null,
    productionQty: row.production_qty !== null && row.production_qty !== undefined ? parseFloat(row.production_qty) : null,
    imageUrl: row.image_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToInvoiceRecord(row: any): InvoiceRecord {
  return {
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date || "",
    billTo: row.bill_to || "",
    quantity: row.quantity !== null && row.quantity !== undefined ? parseFloat(row.quantity) : null,
    ratePerUnit: row.rate_per_unit !== null && row.rate_per_unit !== undefined ? parseFloat(row.rate_per_unit) : null,
    taxableAmount: row.taxable_amount !== null && row.taxable_amount !== undefined ? parseFloat(row.taxable_amount) : null,
    cgstAmount: row.cgst_amount !== null && row.cgst_amount !== undefined ? parseFloat(row.cgst_amount) : null,
    sgstAmount: row.sgst_amount !== null && row.sgst_amount !== undefined ? parseFloat(row.sgst_amount) : null,
    totalAmount: row.total_amount !== null && row.total_amount !== undefined ? parseFloat(row.total_amount) : null,
    imageUrl: row.image_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Re-export dateToComparable for backward compat
export { dateToComparable as parseDateToComparable } from "@/lib/validation";

// ================= TRANSIT RECORDS (ORIGINAL & DUPLICATE) =================

export async function getAllTransitRecords(
  filters: MasterLogFilters = {},
  docType?: string
): Promise<{ records: TransitRecord[]; isPostgres: boolean }> {
  const dbReady = await initDatabase();
  if (dbReady) {
    try {
      const p = getPool();
      const conditions: string[] = [];
      const values: any[] = [];
      let valIndex = 1;

      if (filters.search?.trim()) {
        conditions.push(`(
          stationary_no ILIKE $${valIndex} OR 
          vehicle_no ILIKE $${valIndex} OR 
          mdl_name_consignee_name ILIKE $${valIndex}
        )`);
        values.push(`%${filters.search.trim()}%`);
        valIndex++;
      }

      if (filters.company?.trim()) {
        conditions.push(`mdl_name_consignee_name ILIKE $${valIndex}`);
        values.push(`%${filters.company.trim()}%`);
        valIndex++;
      }

      if (filters.grade?.trim()) {
        const g = filters.grade.trim().toUpperCase();
        if (g === "A") {
          conditions.push(`(mineral_name ILIKE '%- A%' OR mineral_name ILIKE '%Grade A%' OR mineral_name ILIKE '%-A' OR mineral_name = 'A')`);
        } else if (g === "B") {
          conditions.push(`(mineral_name ILIKE '%- B%' OR mineral_name ILIKE '%Grade B%' OR mineral_name ILIKE '%-B' OR mineral_name = 'B')`);
        } else if (g.includes("C") || g.includes("D")) {
          conditions.push(`(mineral_name ILIKE '%C and D%' OR mineral_name ILIKE '%C & D%' OR mineral_name ILIKE '%C%D%')`);
        } else {
          conditions.push(`mineral_name ILIKE $${valIndex++}`);
          values.push(`%${filters.grade.trim()}%`);
        }
      }

      if (filters.month?.trim()) {
        const m = filters.month.trim();
        const parts = m.split("-");
        conditions.push(`(
          dispatch_date ILIKE $${valIndex} OR 
          dispatch_date ILIKE $${valIndex + 1} OR 
          dispatch_date ILIKE $${valIndex + 2}
        )`);
        values.push(`%${m}%`);
        if (parts.length === 2) {
          const [year, month] = parts;
          values.push(`%${month}-${year}%`);
          values.push(`%${month}/${year}%`);
        } else {
          values.push(`%${m}%`);
          values.push(`%${m}%`);
        }
        valIndex += 3;
      }

      const dateExpr = `(CASE
        WHEN dispatch_date ~ '^[0-9]{2}[-/][0-9]{2}[-/][0-9]{4}' THEN to_date(substring(dispatch_date from 1 for 10), 'DD-MM-YYYY')
        WHEN dispatch_date ~ '^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}' THEN to_date(substring(dispatch_date from 1 for 10), 'YYYY-MM-DD')
        ELSE NULL
      END)`;

      if (filters.startDate?.trim() && filters.endDate?.trim()) {
        conditions.push(`${dateExpr} >= to_date($${valIndex++}, 'YYYY-MM-DD') AND ${dateExpr} <= to_date($${valIndex++}, 'YYYY-MM-DD')`);
        values.push(filters.startDate.trim(), filters.endDate.trim());
      } else if (filters.startDate?.trim()) {
        conditions.push(`${dateExpr} >= to_date($${valIndex++}, 'YYYY-MM-DD')`);
        values.push(filters.startDate.trim());
      } else if (filters.endDate?.trim()) {
        conditions.push(`${dateExpr} <= to_date($${valIndex++}, 'YYYY-MM-DD')`);
        values.push(filters.endDate.trim());
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      let query = "";
      const isOriginal = docType?.includes("original");
      const isDuplicate = docType?.includes("duplicate");

      if (isOriginal) {
        query = `
          SELECT *, 'transit_original' AS doc_type 
          FROM transit_pass_original 
          ${whereClause} 
          ORDER BY created_at DESC
        `;
        const res = await p.query(query, values);
        return {
          records: res.rows.map((r) => mapRowToTransitRecord(r, "transit_original")),
          isPostgres: true,
        };
      } else if (isDuplicate) {
        query = `
          SELECT *, NULL::numeric AS production_qty, 'transit_duplicate' AS doc_type 
          FROM transit_pass_duplicate 
          ${whereClause} 
          ORDER BY created_at DESC
        `;
        const res = await p.query(query, values);
        return {
          records: res.rows.map((r) => mapRowToTransitRecord(r, "transit_duplicate")),
          isPostgres: true,
        };
      } else {
        // Query both tables combined
        query = `
          WITH combined_transit AS (
            SELECT stationary_no, 'transit_original'::text AS doc_type,
                   dispatch_date, mdl_name_consignee_name, mineral_name,
                   vehicle_no, dispatch_qty, production_qty,
                   image_url, created_at, updated_at
            FROM transit_pass_original
            UNION ALL
            SELECT stationary_no, 'transit_duplicate'::text AS doc_type,
                   dispatch_date, mdl_name_consignee_name, mineral_name,
                   vehicle_no, dispatch_qty, NULL::numeric AS production_qty,
                   image_url, created_at, updated_at
            FROM transit_pass_duplicate
          )
          SELECT * FROM combined_transit ${whereClause} ORDER BY created_at DESC
        `;
        const res = await p.query(query, values);
        return {
          records: res.rows.map((r) =>
            mapRowToTransitRecord(
              r,
              r.doc_type === "transit_original" ? "transit_original" : "transit_duplicate"
            )
          ),
          isPostgres: true,
        };
      }
    } catch (err: any) {
      console.error("[Database] Error querying PostgreSQL transit tables:", err.message);
    }
  }

  // Fallback to in-memory store
  let items = Array.from(inMemoryTransitStore.values());
  if (docType?.trim()) {
    const norm = docType.includes("original") ? "transit_original" : "transit_duplicate";
    items = items.filter((r) => (r.docType || "transit_duplicate") === norm);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    items = items.filter(
      (r) =>
        r.stationaryNo.toLowerCase().includes(q) ||
        r.vehicleNo.toLowerCase().includes(q) ||
        r.mdlNameConsigneeName.toLowerCase().includes(q)
    );
  }
  if (filters.company?.trim()) {
    const q = filters.company.trim().toLowerCase();
    items = items.filter((r) => r.mdlNameConsigneeName.toLowerCase().includes(q));
  }
  if (filters.grade?.trim()) {
    const g = filters.grade.trim().toUpperCase();
    items = items.filter((r) => {
      const m = (r.mineralName || "").toUpperCase();
      if (g === "A") return m.includes("- A") || m.includes("GRADE A") || m.endsWith("-A") || m === "A";
      if (g === "B") return m.includes("- B") || m.includes("GRADE B") || m.endsWith("-B") || m === "B";
      if (g.includes("C") || g.includes("D")) return m.includes("C AND D") || m.includes("C & D") || m.includes("C") || m.includes("D");
      return m.includes(g);
    });
  }
  if (filters.month?.trim()) {
    const m = filters.month.trim();
    const [year, month] = m.split("-");
    items = items.filter((r) => {
      const comp = dateToComparable(r.dispatchDate);
      if (comp.startsWith(m)) return true;
      return (
        r.dispatchDate.includes(`${month}-${year}`) ||
        r.dispatchDate.includes(`${month}/${year}`) ||
        r.dispatchDate.includes(m)
      );
    });
  }
  if (filters.startDate?.trim() && filters.endDate?.trim()) {
    const start = filters.startDate.trim();
    const end = filters.endDate.trim();
    items = items.filter((r) => {
      const comp = dateToComparable(r.dispatchDate);
      return comp >= start && comp <= end;
    });
  } else if (filters.startDate?.trim()) {
    const start = filters.startDate.trim();
    items = items.filter((r) => dateToComparable(r.dispatchDate) >= start);
  } else if (filters.endDate?.trim()) {
    const end = filters.endDate.trim();
    items = items.filter((r) => dateToComparable(r.dispatchDate) <= end);
  }
  return { records: items, isPostgres: false };
}

export async function getTransitRecordByStationaryNo(
  stationaryNo: string,
  docType?: string
): Promise<TransitRecord | null> {
  const cleanStationary = stationaryNo.trim().toUpperCase();
  const dbReady = await initDatabase();

  if (dbReady) {
    try {
      const p = getPool();
      const isOriginal = docType?.includes("original");
      const isDuplicate = docType?.includes("duplicate");

      if (isOriginal) {
        const res = await p.query(
          "SELECT *, 'transit_original' AS doc_type FROM transit_pass_original WHERE stationary_no = $1",
          [cleanStationary]
        );
        if (res.rows.length > 0) return mapRowToTransitRecord(res.rows[0], "transit_original");
      } else if (isDuplicate) {
        const res = await p.query(
          "SELECT *, 'transit_duplicate' AS doc_type FROM transit_pass_duplicate WHERE stationary_no = $1",
          [cleanStationary]
        );
        if (res.rows.length > 0) return mapRowToTransitRecord(res.rows[0], "transit_duplicate");
      } else {
        const resOrig = await p.query(
          "SELECT *, 'transit_original' AS doc_type FROM transit_pass_original WHERE stationary_no = $1",
          [cleanStationary]
        );
        if (resOrig.rows.length > 0) return mapRowToTransitRecord(resOrig.rows[0], "transit_original");

        const resDup = await p.query(
          "SELECT *, 'transit_duplicate' AS doc_type FROM transit_pass_duplicate WHERE stationary_no = $1",
          [cleanStationary]
        );
        if (resDup.rows.length > 0) return mapRowToTransitRecord(resDup.rows[0], "transit_duplicate");
      }
      return null;
    } catch (err: any) {
      console.error("[Database] Error finding record by stationary_no:", err.message);
    }
  }

  return inMemoryTransitStore.get(cleanStationary) || null;
}

export async function saveTransitRecord(
  record: TransitRecord
): Promise<{ success: boolean; record: TransitRecord; isDuplicate?: boolean; error?: string }> {
  const cleanStationary = record.stationaryNo.trim().toUpperCase();
  const isOriginal = record.docType === "transit_original";
  const targetTable = isOriginal ? "transit_pass_original" : "transit_pass_duplicate";
  const dbReady = await initDatabase();

  const recordToSave: TransitRecord = {
    ...record,
    stationaryNo: cleanStationary,
    docType: isOriginal ? "transit_original" : "transit_duplicate",
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!dbReady) {
    return {
      success: false,
      record: recordToSave,
      error: "Database Connection Failed: PostgreSQL / Neon is offline. Record was NOT saved to prevent data loss.",
    };
  }

  // Store only clean URLs (e.g. Google Drive), avoid saving massive multi-megabyte base64 text into PostgreSQL
  const cleanImageUrl = recordToSave.imageUrl && recordToSave.imageUrl.startsWith("http") ? recordToSave.imageUrl : null;

  try {
    const p = getPool();
    const existing = await p.query(
      `SELECT stationary_no FROM ${targetTable} WHERE stationary_no = $1`,
      [cleanStationary]
    );
    if (existing.rows.length > 0) {
      return { success: false, record: recordToSave, isDuplicate: true };
    }

    if (isOriginal) {
      await p.query(
        `INSERT INTO transit_pass_original (
          stationary_no, dispatch_date, mdl_name_consignee_name,
          mineral_name, vehicle_no, dispatch_qty, production_qty,
          image_url, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          recordToSave.stationaryNo,
          recordToSave.dispatchDate,
          recordToSave.mdlNameConsigneeName,
          recordToSave.mineralName,
          recordToSave.vehicleNo,
          recordToSave.dispatchQty,
          recordToSave.productionQty || null,
          cleanImageUrl,
          recordToSave.createdAt,
          recordToSave.updatedAt,
        ]
      );
    } else {
      await p.query(
        `INSERT INTO transit_pass_duplicate (
          stationary_no, dispatch_date, mdl_name_consignee_name,
          mineral_name, vehicle_no, dispatch_qty,
          image_url, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          recordToSave.stationaryNo,
          recordToSave.dispatchDate,
          recordToSave.mdlNameConsigneeName,
          recordToSave.mineralName,
          recordToSave.vehicleNo,
          recordToSave.dispatchQty,
          cleanImageUrl,
          recordToSave.createdAt,
          recordToSave.updatedAt,
        ]
      );
    }

    inMemoryTransitStore.set(cleanStationary, recordToSave);
    return { success: true, record: recordToSave };
  } catch (err: any) {
    if (err.code === "23505") {
      return { success: false, record: recordToSave, isDuplicate: true };
    }
    console.error("[Database] Error inserting transit record:", err.message);
    return {
      success: false,
      record: recordToSave,
      error: `Database write failed: ${err.message}`,
    };
  }
}

export async function deleteTransitRecord(
  stationaryNo: string,
  docType?: string
): Promise<boolean> {
  const cleanStationary = stationaryNo.trim().toUpperCase();
  const dbReady = await initDatabase();
  if (dbReady) {
    try {
      const p = getPool();
      if (docType?.includes("original")) {
        await p.query("DELETE FROM transit_pass_original WHERE stationary_no = $1", [cleanStationary]);
      } else if (docType?.includes("duplicate")) {
        await p.query("DELETE FROM transit_pass_duplicate WHERE stationary_no = $1", [cleanStationary]);
      } else {
        await Promise.all([
          p.query("DELETE FROM transit_pass_original WHERE stationary_no = $1", [cleanStationary]),
          p.query("DELETE FROM transit_pass_duplicate WHERE stationary_no = $1", [cleanStationary]),
        ]);
      }
    } catch (err: any) {
      console.error("[Database] Error deleting transit record:", err.message);
    }
  }
  inMemoryTransitStore.delete(cleanStationary);
  return true;
}

export async function updateTransitRecord(
  stationaryNo: string,
  updates: Partial<TransitRecord>
): Promise<{ success: boolean; record?: TransitRecord; error?: string }> {
  const cleanStationary = stationaryNo.trim().toUpperCase();
  const dbReady = await initDatabase();
  const now = new Date().toISOString();
  if (dbReady) {
    try {
      const p = getPool();
      let isOriginal = updates.docType === "transit_original";
      let targetTable = isOriginal ? "transit_pass_original" : "transit_pass_duplicate";

      let existing = await p.query(
        `SELECT * FROM ${targetTable} WHERE stationary_no = $1`,
        [cleanStationary]
      );

      // If not found in inferred table, check the other table
      if (existing.rows.length === 0) {
        const altTable = isOriginal ? "transit_pass_duplicate" : "transit_pass_original";
        const altExisting = await p.query(
          `SELECT * FROM ${altTable} WHERE stationary_no = $1`,
          [cleanStationary]
        );
        if (altExisting.rows.length > 0) {
          targetTable = altTable;
          isOriginal = altTable === "transit_pass_original";
          existing = altExisting;
        } else {
          return { success: false, error: `Record '${stationaryNo}' not found in database` };
        }
      }

      if (isOriginal) {
        await p.query(
          `UPDATE transit_pass_original SET
            dispatch_date = COALESCE($2, dispatch_date),
            mdl_name_consignee_name = COALESCE($3, mdl_name_consignee_name),
            mineral_name = COALESCE($4, mineral_name),
            vehicle_no = COALESCE($5, vehicle_no),
            dispatch_qty = COALESCE($6, dispatch_qty),
            production_qty = COALESCE($7, production_qty),
            updated_at = $8
          WHERE stationary_no = $1`,
          [
            cleanStationary,
            updates.dispatchDate || null,
            updates.mdlNameConsigneeName || null,
            updates.mineralName || null,
            updates.vehicleNo || null,
            updates.dispatchQty ?? null,
            updates.productionQty ?? null,
            now,
          ]
        );
      } else {
        await p.query(
          `UPDATE transit_pass_duplicate SET
            dispatch_date = COALESCE($2, dispatch_date),
            mdl_name_consignee_name = COALESCE($3, mdl_name_consignee_name),
            mineral_name = COALESCE($4, mineral_name),
            vehicle_no = COALESCE($5, vehicle_no),
            dispatch_qty = COALESCE($6, dispatch_qty),
            updated_at = $7
          WHERE stationary_no = $1`,
          [
            cleanStationary,
            updates.dispatchDate || null,
            updates.mdlNameConsigneeName || null,
            updates.mineralName || null,
            updates.vehicleNo || null,
            updates.dispatchQty ?? null,
            now,
          ]
        );
      }

      // Fetch the updated record
      const updatedRow = await p.query(
        `SELECT *, '${isOriginal ? "transit_original" : "transit_duplicate"}' AS doc_type FROM ${targetTable} WHERE stationary_no = $1`,
        [cleanStationary]
      );
      if (updatedRow.rows.length > 0) {
        const record = mapRowToTransitRecord(updatedRow.rows[0], isOriginal ? "transit_original" : "transit_duplicate");
        inMemoryTransitStore.set(cleanStationary, record);
        return { success: true, record };
      }
      return { success: true };
    } catch (err: any) {
      console.error("[Database] Error updating transit record:", err.message);
      return { success: false, error: err.message };
    }
  }

  // Fallback: in-memory update
  const memRecord = inMemoryTransitStore.get(cleanStationary);
  if (!memRecord) {
    return { success: false, error: `Record '${stationaryNo}' not found` };
  }
  const updated = { ...memRecord, ...updates, updatedAt: now };
  inMemoryTransitStore.set(cleanStationary, updated);
  return { success: true, record: updated };
}

// ================= TAX INVOICES (STRICT 9 FIELDS) =================

export async function getAllInvoices(
  filters: MasterLogFilters = {}
): Promise<{ invoices: InvoiceRecord[]; isPostgres: boolean }> {
  const dbReady = await initDatabase();
  if (dbReady) {
    try {
      const p = getPool();
      const conditions: string[] = [];
      const values: any[] = [];
      let valIndex = 1;

      if (filters.search?.trim()) {
        conditions.push(`(invoice_no ILIKE $${valIndex} OR bill_to ILIKE $${valIndex})`);
        values.push(`%${filters.search.trim()}%`);
        valIndex++;
      }

      if (filters.company?.trim()) {
        conditions.push(`bill_to ILIKE $${valIndex++}`);
        values.push(`%${filters.company.trim()}%`);
      }

      if (filters.month?.trim()) {
        const m = filters.month.trim();
        const parts = m.split("-");
        conditions.push(`(
          invoice_date ILIKE $${valIndex} OR 
          invoice_date ILIKE $${valIndex + 1} OR 
          invoice_date ILIKE $${valIndex + 2}
        )`);
        values.push(`%${m}%`);
        if (parts.length === 2) {
          const [year, month] = parts;
          values.push(`%${month}/${year}%`);
          values.push(`%${month}-${year}%`);
        } else {
          values.push(`%${m}%`);
          values.push(`%${m}%`);
        }
        valIndex += 3;
      }

      const dateExpr = `(CASE
        WHEN invoice_date ~ '^[0-9]{2}[-/][0-9]{2}[-/][0-9]{4}' THEN to_date(substring(invoice_date from 1 for 10), 'DD-MM-YYYY')
        WHEN invoice_date ~ '^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}' THEN to_date(substring(invoice_date from 1 for 10), 'YYYY-MM-DD')
        ELSE NULL
      END)`;

      if (filters.startDate?.trim() && filters.endDate?.trim()) {
        conditions.push(`${dateExpr} >= to_date($${valIndex++}, 'YYYY-MM-DD') AND ${dateExpr} <= to_date($${valIndex++}, 'YYYY-MM-DD')`);
        values.push(filters.startDate.trim(), filters.endDate.trim());
      } else if (filters.startDate?.trim()) {
        conditions.push(`${dateExpr} >= to_date($${valIndex++}, 'YYYY-MM-DD')`);
        values.push(filters.startDate.trim());
      } else if (filters.endDate?.trim()) {
        conditions.push(`${dateExpr} <= to_date($${valIndex++}, 'YYYY-MM-DD')`);
        values.push(filters.endDate.trim());
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const query = `SELECT * FROM tax_invoices ${whereClause} ORDER BY created_at DESC`;

      const res = await p.query(query, values);
      return { invoices: res.rows.map(mapRowToInvoiceRecord), isPostgres: true };
    } catch (err: any) {
      console.error("[Database] Error querying PostgreSQL tax_invoices:", err.message);
    }
  }

  let items = Array.from(inMemoryInvoiceStore.values());
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    items = items.filter(
      (inv) =>
        inv.invoiceNo.toLowerCase().includes(q) ||
        inv.billTo.toLowerCase().includes(q)
    );
  }
  if (filters.company?.trim()) {
    const q = filters.company.trim().toLowerCase();
    items = items.filter((inv) => inv.billTo.toLowerCase().includes(q));
  }
  if (filters.month?.trim()) {
    const m = filters.month.trim();
    const [year, month] = m.split("-");
    items = items.filter((inv) => {
      const comp = dateToComparable(inv.invoiceDate);
      if (comp.startsWith(m)) return true;
      return (
        inv.invoiceDate.includes(`${month}/${year}`) ||
        inv.invoiceDate.includes(`${month}-${year}`) ||
        inv.invoiceDate.includes(m)
      );
    });
  }
  if (filters.startDate?.trim() && filters.endDate?.trim()) {
    const start = filters.startDate.trim();
    const end = filters.endDate.trim();
    items = items.filter((inv) => {
      const comp = dateToComparable(inv.invoiceDate);
      return comp >= start && comp <= end;
    });
  } else if (filters.startDate?.trim()) {
    const start = filters.startDate.trim();
    items = items.filter((inv) => dateToComparable(inv.invoiceDate) >= start);
  } else if (filters.endDate?.trim()) {
    const end = filters.endDate.trim();
    items = items.filter((inv) => dateToComparable(inv.invoiceDate) <= end);
  }
  return { invoices: items, isPostgres: false };
}

export async function getInvoiceByNo(invoiceNo: string): Promise<InvoiceRecord | null> {
  const cleanInvoiceNo = invoiceNo.trim();
  const dbReady = await initDatabase();
  if (dbReady) {
    try {
      const p = getPool();
      const res = await p.query("SELECT * FROM tax_invoices WHERE invoice_no = $1", [cleanInvoiceNo]);
      if (res.rows.length > 0) return mapRowToInvoiceRecord(res.rows[0]);
    } catch (err: any) {
      console.error("[Database] Error finding invoice by no:", err.message);
    }
  }
  return inMemoryInvoiceStore.get(cleanInvoiceNo) || null;
}

export async function saveInvoice(
  invoice: InvoiceRecord
): Promise<{ success: boolean; invoice: InvoiceRecord; isDuplicate?: boolean; error?: string }> {
  const cleanInvoiceNo = invoice.invoiceNo.trim();
  const dbReady = await initDatabase();

  const recordToSave: InvoiceRecord = {
    ...invoice,
    invoiceNo: cleanInvoiceNo,
    createdAt: invoice.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!dbReady) {
    return {
      success: false,
      invoice: recordToSave,
      error: "Database Connection Failed: PostgreSQL / Neon is offline. Invoice was NOT saved to prevent data loss.",
    };
  }

  // Store only clean URLs (e.g. Google Drive), avoid saving massive multi-megabyte base64 text into PostgreSQL
  const cleanImageUrl = recordToSave.imageUrl && recordToSave.imageUrl.startsWith("http") ? recordToSave.imageUrl : null;

  try {
    const p = getPool();
    const existing = await p.query(
      "SELECT invoice_no FROM tax_invoices WHERE invoice_no = $1",
      [cleanInvoiceNo]
    );
    if (existing.rows.length > 0) {
      return { success: false, invoice: recordToSave, isDuplicate: true };
    }

    await p.query(
      `INSERT INTO tax_invoices (
        invoice_no, bill_to, invoice_date, quantity, rate_per_unit,
        taxable_amount, cgst_amount, sgst_amount, total_amount,
        image_url, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )`,
      [
        recordToSave.invoiceNo,
        recordToSave.billTo,
        recordToSave.invoiceDate,
        recordToSave.quantity,
        recordToSave.ratePerUnit,
        recordToSave.taxableAmount,
        recordToSave.cgstAmount,
        recordToSave.sgstAmount,
        recordToSave.totalAmount,
        cleanImageUrl,
        recordToSave.createdAt,
        recordToSave.updatedAt,
      ]
    );

    inMemoryInvoiceStore.set(cleanInvoiceNo, recordToSave);
    return { success: true, invoice: recordToSave };
  } catch (err: any) {
    if (err.code === "23505") {
      return { success: false, invoice: recordToSave, isDuplicate: true };
    }
    console.error("[Database] Error inserting invoice into tax_invoices:", err.message);
    return {
      success: false,
      invoice: recordToSave,
      error: `Database write failed: ${err.message}`,
    };
  }
}

export async function deleteInvoice(invoiceNo: string): Promise<boolean> {
  const cleanInvoiceNo = invoiceNo.trim();
  const dbReady = await initDatabase();
  if (dbReady) {
    try {
      const p = getPool();
      await p.query("DELETE FROM tax_invoices WHERE invoice_no = $1", [cleanInvoiceNo]);
    } catch (err: any) {
      console.error("[Database] Error deleting invoice from tax_invoices:", err.message);
    }
  }
  inMemoryInvoiceStore.delete(cleanInvoiceNo);
  return true;
}

export async function updateInvoice(
  invoiceNo: string,
  updates: Partial<InvoiceRecord>
): Promise<{ success: boolean; invoice?: InvoiceRecord; error?: string }> {
  const cleanInvoiceNo = invoiceNo.trim();
  const dbReady = await initDatabase();
  const now = new Date().toISOString();

  if (dbReady) {
    try {
      const p = getPool();
      const existing = await p.query(
        "SELECT * FROM tax_invoices WHERE invoice_no = $1",
        [cleanInvoiceNo]
      );
      if (existing.rows.length === 0) {
        return { success: false, error: `Invoice '${invoiceNo}' not found` };
      }

      await p.query(
        `UPDATE tax_invoices SET
          bill_to = COALESCE($2, bill_to),
          invoice_date = COALESCE($3, invoice_date),
          quantity = COALESCE($4, quantity),
          rate_per_unit = COALESCE($5, rate_per_unit),
          taxable_amount = COALESCE($6, taxable_amount),
          cgst_amount = COALESCE($7, cgst_amount),
          sgst_amount = COALESCE($8, sgst_amount),
          total_amount = COALESCE($9, total_amount),
          updated_at = $10
        WHERE invoice_no = $1`,
        [
          cleanInvoiceNo,
          updates.billTo || null,
          updates.invoiceDate || null,
          updates.quantity ?? null,
          updates.ratePerUnit ?? null,
          updates.taxableAmount ?? null,
          updates.cgstAmount ?? null,
          updates.sgstAmount ?? null,
          updates.totalAmount ?? null,
          now,
        ]
      );

      const updatedRow = await p.query(
        "SELECT * FROM tax_invoices WHERE invoice_no = $1",
        [cleanInvoiceNo]
      );
      if (updatedRow.rows.length > 0) {
        const invoice = mapRowToInvoiceRecord(updatedRow.rows[0]);
        inMemoryInvoiceStore.set(cleanInvoiceNo, invoice);
        return { success: true, invoice };
      }
      return { success: true };
    } catch (err: any) {
      console.error("[Database] Error updating invoice:", err.message);
      return { success: false, error: err.message };
    }
  }

  // Fallback: in-memory update
  const memInvoice = inMemoryInvoiceStore.get(cleanInvoiceNo);
  if (!memInvoice) {
    return { success: false, error: `Invoice '${invoiceNo}' not found` };
  }
  const updated = { ...memInvoice, ...updates, updatedAt: now };
  inMemoryInvoiceStore.set(cleanInvoiceNo, updated);
  return { success: true, invoice: updated };
}

// ================= OVERALL STATS =================

export async function getOverallStats() {
  const [transitRes, invoiceRes] = await Promise.all([
    getAllTransitRecords(),
    getAllInvoices(),
  ]);

  const transitRecords = transitRes.records;
  const invoices = invoiceRes.invoices;

  const duplicateCount = transitRecords.filter(
    (r) => (r.docType || "transit_duplicate") === "transit_duplicate"
  ).length;

  const originalCount = transitRecords.filter(
    (r) => r.docType === "transit_original"
  ).length;

  const totalQty = transitRecords.reduce(
    (acc, curr) => acc + (curr.dispatchQty || curr.productionQty || 0),
    0
  );
  const uniqueVehicles = new Set(
    transitRecords.map((r) => r.vehicleNo.trim().toUpperCase()).filter(Boolean)
  ).size;

  return {
    totalTransitRecords: transitRecords.length,
    duplicateCount,
    originalCount,
    invoiceCount: invoices.length,
    totalQtyMt: Math.round(totalQty * 100) / 100,
    uniqueVehicles,
    isPostgres: transitRes.isPostgres,
  };
}
