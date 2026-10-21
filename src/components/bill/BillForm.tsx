"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { BILL_TYPES, BillData, BillType, checkBill, cleanBillData } from "@/lib/bill-types";
import { Button } from "@/components/ui/Button";
import { FieldInput, FieldState } from "./FieldInput";

interface Props {
  type: BillType;
  initial: BillData;
  unsure?: string[];          // fields the AI was unsure about
  submitLabel?: string;
  saving?: boolean;
  onSubmit: (data: BillData) => void;
  footer?: React.ReactNode;
}

// The review/edit form shared by "scan a bill" and "edit a bill".
// Numbers are re-checked as the user types (GST adds up, vehicle format, …).
export function BillForm({ type, initial, unsure = [], submitLabel = "Save bill", saving, onSubmit, footer }: Props) {
  const def = BILL_TYPES[type];
  const [values, setValues] = useState<Record<string, string | number | null>>(() => ({ ...initial }));
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const checks = useMemo(() => checkBill(type, cleanBillData(type, values)), [type, values]);

  function stateFor(key: string): { state: FieldState; message?: string } {
    const c = checks.find((x) => x.field === key);
    if (c) return { state: c.level === "error" ? "error" : "check", message: c.message };
    if (unsure.includes(key) && !touched.has(key)) return { state: "check", message: "Hard to read on the photo — compare with the bill" };
    return { state: "ok" };
  }

  const needsLook = def.fields.filter((f) => stateFor(f.key).state !== "ok").length;

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(cleanBillData(type, values));
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {def.fields.map((f) => {
          const s = stateFor(f.key);
          return (
            <div key={f.key} className={f.kind === "text" && f.key !== def.keyField ? "sm:col-span-2" : ""}>
              <FieldInput
                field={f}
                value={values[f.key] ?? null}
                state={s.state}
                message={s.message}
                onChange={(v) => {
                  setValues((prev) => ({ ...prev, [f.key]: v }));
                  setTouched((prev) => new Set(prev).add(f.key));
                }}
              />
            </div>
          );
        })}
      </div>

      {needsLook > 0 && (
        <p className="rounded-xl bg-gold-soft px-3 py-2 text-center text-sm font-medium text-[#7a5308]">
          {needsLook} {needsLook === 1 ? "field needs" : "fields need"} a look before saving
        </p>
      )}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-10 md:bottom-4">
        <Button type="submit" size="xl" full loading={saving} icon={<Check className="size-6" />}>
          {submitLabel}
        </Button>
      </div>
      {footer}
    </form>
  );
}
