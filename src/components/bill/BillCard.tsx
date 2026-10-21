import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BILL_TYPES, Bill, formatDate, formatINR, formatQty } from "@/lib/bill-types";
import { BILL_STYLE, BillTypeChip } from "./billStyle";

// One bill in a list: number, date, party and the main figure.
export function BillCard({ bill, showType = false }: { bill: Bill; showType?: boolean }) {
  const def = BILL_TYPES[bill.type];
  return (
    <Link
      href={`/bills/${bill.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-paper p-4 shadow-card transition hover:border-clay/30 active:scale-[0.99]"
    >
      <span className={`h-12 w-1.5 shrink-0 rounded-full ${BILL_STYLE[bill.type].dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold tracking-tight text-ink">{bill.docNo}</span>
          {showType && <BillTypeChip type={bill.type} size="sm" />}
        </div>
        <p className="truncate text-[0.95rem] text-ink-soft">{bill.party || "—"}</p>
        <p className="text-sm text-ink-faint">
          {formatDate(bill.date)}
          {bill.vehicleNo && ` · ${bill.vehicleNo}`}
        </p>
      </div>
      <div className="text-right">
        {def.amountField && bill.amount !== null ? (
          <>
            <p className="font-semibold text-ink">{formatINR(bill.amount, 0)}</p>
            <p className="text-sm text-ink-faint">{formatQty(bill.qty)}</p>
          </>
        ) : (
          <p className="font-semibold text-ink">{formatQty(bill.qty)}</p>
        )}
      </div>
      <ChevronRight className="size-5 shrink-0 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-clay" />
    </Link>
  );
}

export function BillListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-2xl border border-line bg-paper/70" />
      ))}
    </div>
  );
}
