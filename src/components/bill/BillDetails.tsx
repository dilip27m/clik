import { BILL_TYPES, Bill, formatDate, formatINR, formatQty } from "@/lib/bill-types";

// Read-only list of a bill's fields, formatted for reading.
export function BillDetails({ bill }: { bill: Bill }) {
  const def = BILL_TYPES[bill.type];
  return (
    <dl className="divide-y divide-line">
      {def.fields.map((f) => {
        const v = bill.data[f.key];
        const shown =
          v === null || v === ""
            ? "—"
            : f.kind === "money"
              ? formatINR(Number(v))
              : f.kind === "qty"
                ? formatQty(Number(v))
                : f.kind === "date"
                  ? formatDate(String(v))
                  : String(v);
        return (
          <div key={f.key} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
            <dt className="text-ink-soft">{f.label}</dt>
            <dd className={`text-right font-semibold text-ink ${f.kind === "money" || f.kind === "qty" ? "tabular-nums" : ""}`}>{shown}</dd>
          </div>
        );
      })}
    </dl>
  );
}
