import "server-only";
import { getModelUsage, incrementModelUse, setModelExhausted } from "./db";

// Gemini free tier (measured from Google's quota errors, Oct 2026):
// 20 requests per model per day per Google Cloud project, reset at midnight
// US Pacific time. One bill scan normally uses one request.
const DAILY_PER_MODEL = Number(process.env.GEMINI_FREE_DAILY_PER_MODEL || 20);
const PROJECTS = Number(process.env.GEMINI_PROJECTS || 1);

// Best reader first. All four read the sample bills correctly.
export const MODELS = (process.env.GEMINI_MODELS || "gemini-3.8-flash,gemini-3.5-flash,gemini-3.7-flash,gemini-3.1-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const perModelLimit = () => DAILY_PER_MODEL * PROJECTS;

function pacificParts(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

// The quota "day" as Google counts it.
export function quotaDay(at = new Date()): string {
  const p = pacificParts(at);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function nextResetAt(now = new Date()): string {
  const p = pacificParts(now);
  const wallAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000; // Pacific minus UTC
  return new Date(Date.UTC(p.y, p.m - 1, p.d + 1) - offset).toISOString();
}

export async function availableModels(): Promise<string[]> {
  const usage = await getModelUsage(quotaDay());
  return MODELS.filter((m) => !usage[m]?.exhausted && (usage[m]?.used ?? 0) < perModelLimit());
}

export async function creditsLeft(): Promise<{ left: number; total: number; resetsAt: string }> {
  const usage = await getModelUsage(quotaDay());
  const total = MODELS.length * perModelLimit();
  const left = MODELS.reduce((sum, m) => (usage[m]?.exhausted ? sum : sum + Math.max(0, perModelLimit() - (usage[m]?.used ?? 0))), 0);
  return { left, total, resetsAt: nextResetAt() };
}

export const recordModelUse = (model: string) => incrementModelUse(quotaDay(), model);
export const markModelExhausted = (model: string) => setModelExhausted(quotaDay(), model);
