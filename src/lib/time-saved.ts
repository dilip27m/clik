import { BILL_TYPES, Bill, BillType, Timings } from "./bill-types";

// Rough cost of typing one bill into Excel by hand: finding the bill, opening
// the sheet and checking the row (45 s) plus about 20 s per field.
export function manualSeconds(type: BillType): number {
  return 45 + BILL_TYPES[type].fields.length * 20;
}

// Time the app took for one bill (from photo to saved). Bills saved before
// timing existed count as 40 s.
export function appSeconds(t: Timings): number {
  const parts = [t.prepareMs, t.uploadMs, t.aiMs, t.reviewMs, t.dbMs].filter((v): v is number => typeof v === "number");
  return parts.length ? parts.reduce((a, b) => a + b, 0) / 1000 : 40;
}

export function savedSeconds(bill: Pick<Bill, "type" | "timings">): number {
  return Math.max(0, manualSeconds(bill.type) - appSeconds(bill.timings));
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} sec`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

// A cheeky way to say how much time was saved.
const COMPARISONS = [
  { per: 5 * 60, one: "cup of chai", many: "cups of chai", emoji: "☕" },
  { per: 4 * 60, one: "over of cricket", many: "overs of cricket", emoji: "🏏" },
  { per: 22 * 60, one: "TV serial episode", many: "TV serial episodes", emoji: "📺" },
  { per: 20 * 60, one: "afternoon nap", many: "afternoon naps", emoji: "😴" },
  { per: 3 * 60, one: "old song on the radio", many: "old songs on the radio", emoji: "📻" },
];

export function teasingLine(totalSeconds: number, bills: number, pick: number): string {
  if (bills === 0) return "Nanna, scan your first bill and I'll start counting the time I save you 😉";
  const c = COMPARISONS[pick % COMPARISONS.length];
  const n = Math.max(1, Math.floor(totalSeconds / c.per));
  const what = `${n} ${n === 1 ? c.one : c.many} ${c.emoji}`;
  const lines = [
    `Nanna, I've saved you ${formatDuration(totalSeconds)} of typing on ${bills} bills. That's ${what}!`,
    `${formatDuration(totalSeconds)} saved so far. Enough for ${what}. You're welcome 😎`,
    `No more typing every box! ${formatDuration(totalSeconds)} back in your pocket. That's ${what}.`,
  ];
  return lines[pick % lines.length];
}
