"use client";

import { formatMonth } from "@/lib/bill-types";

function recentMonths(count = 18): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export function MonthSelect({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Month"
      className="h-12 rounded-xl border border-line-strong bg-paper px-3 font-medium text-ink outline-none focus:border-clay focus:ring-4 focus:ring-clay/20"
    >
      <option value="">All months</option>
      {recentMonths().map((m) => (
        <option key={m} value={m}>
          {formatMonth(m)}
        </option>
      ))}
    </select>
  );
}
