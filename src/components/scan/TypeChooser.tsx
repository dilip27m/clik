"use client";

import { ChevronRight } from "lucide-react";
import { BILL_TYPES, BILL_TYPE_ORDER, BillType } from "@/lib/bill-types";
import { BILL_STYLE } from "@/components/bill/billStyle";

export function TypeChooser({ onChoose, current }: { onChoose: (t: BillType) => void; current?: BillType }) {
  return (
    <div className="space-y-3">
      {BILL_TYPE_ORDER.map((t) => {
        const s = BILL_STYLE[t];
        const Icon = s.icon;
        return (
          <button
            key={t}
            onClick={() => onChoose(t)}
            className={`flex w-full items-center gap-4 rounded-2xl border bg-paper p-4 text-left shadow-card transition hover:border-clay/40 ${
              current === t ? "border-clay ring-4 ring-clay/15" : "border-line"
            }`}
          >
            <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${s.chip}`}>
              <Icon className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-ink">{BILL_TYPES[t].name}</span>
              <span className="block text-sm text-ink-soft">{BILL_TYPES[t].hint}</span>
            </span>
            <ChevronRight className="size-5 text-ink-faint" />
          </button>
        );
      })}
    </div>
  );
}
