import type { Bill, BillType, Check, BillData } from "@/lib/bill-types";
import type { Credits } from "@/components/CreditsBadge";

export interface HomeResponse {
  stats: { month: string; byType: Record<BillType, { count: number; qty: number; amount: number; gst: number }> };
  recent: Bill[];
  unmatched: Bill[];
  credits: Credits;
  sheetUrl: string | null;
  sheetsConfigured: boolean;
}

export interface Extracted {
  type: BillType;
  company: string | null;
  data: BillData;
  unsure: string[];
  checks: Check[];
}

export type ExtractResponse = (
  | ({ ok: true } & Extracted)
  | { ok: false; reason: string; retake?: boolean; draft?: Extracted; outOfCredits?: boolean; resetsAt?: string }
) & { existingId?: number | null; credits?: Credits; aiMs?: number };
