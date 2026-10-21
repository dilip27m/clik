import Link from "next/link";
import { BILL_TYPES, BILL_TYPE_ORDER, BillType, formatINR, formatQty } from "@/lib/bill-types";
import { BILL_STYLE } from "@/components/bill/billStyle";
import type { HomeResponse } from "@/lib/client/types";

// Four tiles: ore in, purchases, powder out, sales — for the current month.
export function MonthSummary({ stats }: { stats?: HomeResponse["stats"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {BILL_TYPE_ORDER.map((type) => (
        <Tile key={type} type={type} t={stats?.byType[type]} />
      ))}
    </div>
  );
}

function Tile({ type, t }: { type: BillType; t?: { count: number; qty: number; amount: number } }) {
  const def = BILL_TYPES[type];
  const style = BILL_STYLE[type];
  const Icon = style.icon;
  const main = def.amountField ? formatINR(t?.amount ?? 0, 0) : formatQty(t?.qty ?? 0);
  const sub = def.amountField ? formatQty(t?.qty ?? 0) : null;
  return (
    <Link href={`/bills?type=${type}`} className="rounded-2xl border border-line bg-paper p-4 shadow-card transition hover:border-clay/30">
      <div className="flex items-center justify-between">
        <span className={`grid size-9 place-items-center rounded-xl ${style.chip}`}>
          <Icon className="size-5" />
        </span>
        <span className="text-sm font-medium text-ink-faint">{t?.count ?? 0} bills</span>
      </div>
      <p className="mt-3 text-sm font-medium text-ink-soft">{def.name}</p>
      <p className="font-display text-[1.35rem] leading-tight font-semibold text-ink">{t ? main : "…"}</p>
      {sub && <p className="text-sm text-ink-faint">{sub}</p>}
    </Link>
  );
}
