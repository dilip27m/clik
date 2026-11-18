import "server-only";
import type { Extracted } from "./extractor";
import { db } from "./db";

// A photo in a batch. Lives in the database until the person confirms
// (it becomes a bill) or rejects it, so nothing is lost if the app closes.
export type JobStatus = "queued" | "reading" | "ready" | "check" | "failed";

export interface ScanJob {
  id: number;
  company: string;
  status: JobStatus;
  attempts: number;
  result: Extracted | null; // what was read (also kept for "check" when a draft exists)
  error: string | null;     // why it needs a look / failed / is waiting
  existingId: number | null; // a saved bill with the same number
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

const FIELDS = `id, company, status, attempts, result, error, existing_id, created_at, started_at, finished_at`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toJob(r: any): ScanJob {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: Number(r.id),
    company: r.company,
    status: r.status,
    attempts: r.attempts,
    result: r.result,
    error: r.error,
    existingId: r.existing_id === null ? null : Number(r.existing_id),
    createdAt: iso(r.created_at)!,
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
  };
}

export async function createJob(company: string, photo: { mime: string; data: Buffer }, blurryReason?: string): Promise<ScanJob> {
  const pool = await db();
  // A photo that already looks blurry on the phone is not sent to the AI
  // (saves a free scan); the person can still choose "Read anyway".
  const { rows } = await pool.query(
    `INSERT INTO scan_jobs (company, mime, photo, status, error, finished_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'check' THEN now() END)
     RETURNING ${FIELDS}`,
    [company, photo.mime, photo.data, blurryReason ? "check" : "queued", blurryReason ?? null]
  );
  return toJob(rows[0]);
}

// The batch plus the database's current time (job times use the database clock).
export async function listJobs(company: string): Promise<{ jobs: ScanJob[]; now: string }> {
  const pool = await db();
  const [{ rows }, clock] = await Promise.all([
    pool.query(`SELECT ${FIELDS} FROM scan_jobs WHERE company = $1 ORDER BY id`, [company]),
    pool.query(`SELECT now() AS now`),
  ]);
  return { jobs: rows.map(toJob), now: new Date(clock.rows[0].now).toISOString() };
}

export async function getJob(id: number): Promise<ScanJob | null> {
  const pool = await db();
  const { rows } = await pool.query(`SELECT ${FIELDS} FROM scan_jobs WHERE id = $1`, [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

export async function getJobPhoto(id: number): Promise<{ mime: string; data: Buffer } | null> {
  const pool = await db();
  const { rows } = await pool.query(`SELECT mime, photo FROM scan_jobs WHERE id = $1`, [id]);
  return rows[0] ? { mime: rows[0].mime, data: rows[0].photo } : null;
}

// Takes up to `capacity` photos to read, counting ones already being read.
// A photo stuck in "reading" for 3 minutes (server stopped) is picked up again.
export async function claimJobs(capacity: number): Promise<{ id: number; company: string; mime: string; photo: Buffer; attempts: number }[]> {
  const pool = await db();
  const { rows } = await pool.query(
    `UPDATE scan_jobs SET status = 'reading', started_at = now(), attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM scan_jobs
       WHERE (status = 'queued' AND not_before <= now())
          OR (status = 'reading' AND started_at < now() - interval '3 minutes')
       ORDER BY id
       LIMIT GREATEST(0, $1 - (SELECT count(*) FROM scan_jobs WHERE status = 'reading' AND started_at >= now() - interval '3 minutes'))
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, company, mime, photo, attempts`,
    [capacity]
  );
  return rows.map((r) => ({ id: Number(r.id), company: r.company, mime: r.mime, photo: r.photo, attempts: r.attempts }));
}

export async function finishJob(id: number, f: { status: "ready" | "check" | "failed"; result?: Extracted | null; error?: string | null; existingId?: number | null }) {
  const pool = await db();
  await pool.query(
    `UPDATE scan_jobs SET status = $2, result = $3, error = $4, existing_id = $5, finished_at = now() WHERE id = $1`,
    [id, f.status, f.result ?? null, f.error ?? null, f.existingId ?? null]
  );
}

// Put a photo back in line, to be tried again after `at`.
export async function requeueJob(id: number, at: Date, error: string, countAttempt = true) {
  const pool = await db();
  await pool.query(
    `UPDATE scan_jobs SET status = 'queued', not_before = $2, error = $3,
       attempts = CASE WHEN $4 THEN attempts ELSE attempts - 1 END
     WHERE id = $1`,
    [id, at, error, countAttempt]
  );
}

// "Retry" / "Read anyway" from the person: a fresh start for that photo.
export async function retryJob(id: number): Promise<boolean> {
  const pool = await db();
  const { rowCount } = await pool.query(
    `UPDATE scan_jobs SET status = 'queued', attempts = 0, not_before = now(), error = NULL, result = NULL,
       existing_id = NULL, started_at = NULL, finished_at = NULL
     WHERE id = $1 AND status IN ('ready', 'check', 'failed', 'queued')`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteJob(id: number) {
  const pool = await db();
  await pool.query(`DELETE FROM scan_jobs WHERE id = $1`, [id]);
}

// Is there a photo that could be read right now, with nothing reading it?
export async function readerNeeded(): Promise<boolean> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT
       EXISTS (SELECT 1 FROM scan_jobs WHERE status = 'queued' AND not_before <= now())
       OR EXISTS (SELECT 1 FROM scan_jobs WHERE status = 'reading' AND started_at < now() - interval '3 minutes') AS waiting,
       EXISTS (SELECT 1 FROM scan_jobs WHERE status = 'reading' AND started_at >= now() - interval '3 minutes') AS active`
  );
  return rows[0].waiting && !rows[0].active;
}

// Is another reader run reading a photo right now?
export async function readerActive(): Promise<boolean> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM scan_jobs WHERE status = 'reading' AND started_at >= now() - interval '3 minutes') AS active`
  );
  return rows[0].active;
}

// Milliseconds until the next waiting photo may be tried (null if none waits).
export async function msUntilNextJob(): Promise<number | null> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT GREATEST(0, EXTRACT(EPOCH FROM (min(not_before) - now())) * 1000)::bigint AS ms FROM scan_jobs WHERE status = 'queued'`
  );
  return rows[0].ms === null ? null : Number(rows[0].ms);
}

export async function jobCounts(company: string): Promise<{ reading: number; toCheck: number }> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE status IN ('queued', 'reading'))::int AS reading,
            count(*) FILTER (WHERE status IN ('ready', 'check', 'failed'))::int AS to_check
     FROM scan_jobs WHERE company = $1`,
    [company]
  );
  return { reading: rows[0].reading, toCheck: rows[0].to_check };
}
