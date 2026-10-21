"use client";

import { FieldDef, GRADE_OPTIONS } from "@/lib/bill-types";

export type FieldState = "ok" | "check" | "error";

const RING: Record<FieldState, string> = {
  ok: "border-line-strong focus:border-clay focus:ring-clay/20",
  check: "border-gold bg-gold-soft/50 focus:border-gold focus:ring-gold/25",
  error: "border-rust bg-rust-soft/40 focus:border-rust focus:ring-rust/20",
};

interface Props {
  field: FieldDef;
  value: string | number | null;
  onChange: (v: string) => void;
  state?: FieldState;
  message?: string;
}

// One labelled input; its look changes when the value needs checking.
export function FieldInput({ field, value, onChange, state = "ok", message }: Props) {
  const id = `f-${field.key}`;
  const base = `w-full rounded-xl border bg-paper px-4 py-3 text-lg text-ink outline-none transition focus:ring-4 ${RING[state]}`;
  const v = value === null || value === undefined ? "" : String(value);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center justify-between gap-2 text-[0.95rem] font-medium text-ink-soft">
        <span>
          {field.label}
          {field.required && <span className="text-clay"> *</span>}
        </span>
        {state === "check" && <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-white">Please check</span>}
      </label>
      {field.kind === "grade" ? (
        <select id={id} value={v} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Choose grade…</option>
          {GRADE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      ) : (
        <div className="relative">
          {field.kind === "money" && <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg text-ink-faint">₹</span>}
          <input
            id={id}
            type={field.kind === "date" ? "date" : "text"}
            inputMode={field.kind === "money" || field.kind === "qty" ? "decimal" : undefined}
            autoCapitalize={field.kind === "vehicle" ? "characters" : undefined}
            value={v}
            onChange={(e) => onChange(field.kind === "vehicle" ? e.target.value.toUpperCase() : e.target.value)}
            className={`${base} ${field.kind === "money" ? "pl-9" : ""} ${field.kind === "qty" ? "pr-14" : ""}`}
          />
          {field.kind === "qty" && <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-faint">MT</span>}
        </div>
      )}
      {message && <p className={`mt-1.5 text-sm ${state === "error" ? "text-rust" : "text-[#7a5308]"}`}>{message}</p>}
    </div>
  );
}
