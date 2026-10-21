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

export function MonthSelect({
  value,
  onChange,
  allowAll = true,
  className = "h-12",
}: {
  value: string;
  onChange: (m: string) => void;
  allowAll?: boolean;
  className?: string;
}) {
  const months = recentMonths();
  if (value && !months.includes(value)) months.push(value); // an older month that has bills
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Month"
      className={`rounded-xl border border-line-strong bg-paper px-3 font-medium text-ink outline-none focus:border-clay focus:ring-4 focus:ring-clay/20 ${className}`}
    >
      {allowAll && <option value="">All months</option>}
      {months.map((m) => (
        <option key={m} value={m}>
          {formatMonth(m)}
        </option>
      ))}
    </select>
  );
}
