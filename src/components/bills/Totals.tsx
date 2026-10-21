import { BILL_TYPES, Bill, BillType, formatINR, formatQty } from "@/lib/bill-types";

// Count / quantity / amount for the bills currently shown.
export function Totals({ type, bills }: { type: BillType; bills: Bill[] }) {
  const def = BILL_TYPES[type];
  const qty = bills.reduce((s, b) => s + (b.qty ?? 0), 0);
  const amount = bills.reduce((s, b) => s + (b.amount ?? 0), 0);
  const items = [
    { label: "Bills", value: String(bills.length) },
    { label: "Quantity", value: formatQty(qty) },
    ...(def.amountField ? [{ label: def.fields.find((f) => f.key === def.amountField)!.label, value: formatINR(amount, 0) }] : []),
  ];
  return (
    <div className={`grid gap-px overflow-hidden rounded-2xl border border-line bg-line ${items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {items.map((i) => (
        <div key={i.label} className="bg-paper px-3 py-3 text-center">
          <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">{i.label}</p>
          <p className="mt-0.5 font-display text-lg font-semibold text-ink sm:text-xl">{i.value}</p>
        </div>
      ))}
    </div>
  );
}
