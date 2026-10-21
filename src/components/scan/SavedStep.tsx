"use client";

import Link from "next/link";
import { CircleCheck, ScanLine } from "lucide-react";
import { BILL_TYPES, Bill, formatDate } from "@/lib/bill-types";
import { Button, ButtonLink } from "@/components/ui/Button";

export function SavedStep({ bill, queueLeft, onNext }: { bill: Bill; queueLeft: number; onNext: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-6 py-6 text-center animate-rise">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-leaf-soft text-leaf">
        <CircleCheck className="size-11" />
      </span>
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Saved!</h1>
        <p className="mt-2 text-lg text-ink-soft">
          {BILL_TYPES[bill.type].name} <span className="font-semibold text-ink">{bill.docNo}</span> · {formatDate(bill.date)}
        </p>
        <p className="mt-1 text-sm text-ink-faint">It will appear in the Google Sheet in a few seconds.</p>
      </div>
      <div className="space-y-3">
        <Button size="xl" full icon={<ScanLine className="size-6" />} onClick={onNext}>
          {queueLeft > 0 ? `Next photo (${queueLeft} left)` : "Scan next bill"}
        </Button>
        <ButtonLink href={`/bills/${bill.id}`} variant="secondary" size="lg" full>
          View this bill
        </ButtonLink>
        <Link href="/" className="block py-2 font-medium text-clay hover:text-clay-dark">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
