import { ArrowDownToLine, ArrowUpFromLine, FileText, ReceiptIndianRupee } from "lucide-react";
import { BILL_TYPES, BillType } from "@/lib/bill-types";

// Each bill type gets its own colour and icon so it can be recognised at a glance.
export const BILL_STYLE: Record<BillType, { chip: string; dot: string; icon: typeof FileText }> = {
  transit_in: { chip: "bg-leaf-soft text-leaf", dot: "bg-leaf", icon: ArrowDownToLine },
  apmdc_invoice: { chip: "bg-gold-soft text-gold", dot: "bg-gold", icon: ReceiptIndianRupee },
  form_e: { chip: "bg-clay-soft text-clay-dark", dot: "bg-clay", icon: ArrowUpFromLine },
  sales_invoice: { chip: "bg-plum-soft text-plum", dot: "bg-plum", icon: FileText },
};

export function BillTypeChip({ type, size = "md" }: { type: BillType; size?: "sm" | "md" }) {
  const s = BILL_STYLE[type];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${s.chip} ${
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
      {BILL_TYPES[type].name}
    </span>
  );
}
