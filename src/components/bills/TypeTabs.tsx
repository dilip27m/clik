"use client";

import { BILL_TYPES, BILL_TYPE_ORDER, BillType } from "@/lib/bill-types";
import { BILL_STYLE } from "@/components/bill/billStyle";

// The 4 bill types as tabs — on phones they scroll sideways.
export function TypeTabs({ value, onChange }: { value: BillType; onChange: (t: BillType) => void }) {
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <div className="flex w-max gap-2 rounded-2xl border border-line bg-paper p-1.5 shadow-card sm:w-full">
        {BILL_TYPE_ORDER.map((t) => {
          const active = t === value;
          const Icon = BILL_STYLE[t].icon;
          return (
            <button
              key={t}
              onClick={() => onChange(t)}
              className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 font-semibold whitespace-nowrap transition ${
                active ? "bg-clay text-white shadow-lift" : "text-ink-soft hover:bg-cream"
              }`}
            >
              <Icon className="size-5" />
              {BILL_TYPES[t].name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
