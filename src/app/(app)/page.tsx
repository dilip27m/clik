"use client";

import Link from "next/link";
import { ChevronRight, ScanLine, TriangleAlert } from "lucide-react";
import { formatDate, formatMonth, formatQty } from "@/lib/bill-types";
import { useCached } from "@/lib/client/useCached";
import type { HomeResponse } from "@/lib/client/types";
import { BillCard, BillListSkeleton } from "@/components/bill/BillCard";
import { BillTypeChip } from "@/components/bill/billStyle";
import { CreditsBadge } from "@/components/CreditsBadge";
import { MonthSummary } from "@/components/home/MonthSummary";
import { ButtonLink } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const { data, error } = useCached<HomeResponse>("/api/home");
  const month = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-8">
      <section className="animate-rise">
        <p className="text-ink-soft">{greeting()} 🙏</p>
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">What bill do you have today?</h1>
      </section>

      <Card className="overflow-hidden">
        <div className="bg-[radial-gradient(120%_120%_at_100%_0%,#f6e3d6_0%,transparent_60%)] p-5 sm:p-6">
          <p className="mb-4 max-w-md text-ink-soft">
            Take a photo of any of the 4 bills. The app reads it, you check it, and it goes into the Google Sheet.
          </p>
          <ButtonLink href="/scan" size="xl" full icon={<ScanLine className="size-7" />} className="sm:w-auto">
            Scan a Bill
          </ButtonLink>
          <div className="mt-4">
            <CreditsBadge credits={data?.credits} compact />
          </div>
        </div>
      </Card>

      {error && !data && <Notice tone="error" title="Could not load">{error}</Notice>}

      <section>
        <SectionTitle>{formatMonth(month)} so far</SectionTitle>
        <MonthSummary stats={data?.stats} />
      </section>

      {data && data.unmatched.length > 0 && (
        <section>
          <SectionTitle>Needs a look</SectionTitle>
          <Card className="divide-y divide-line">
            {data.unmatched.slice(0, 5).map((b) => (
              <Link key={b.id} href={`/bills/${b.id}`} className="flex items-center gap-3 p-4 hover:bg-cream/60">
                <TriangleAlert className="size-5 shrink-0 text-gold" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {b.docNo} <span className="font-normal text-ink-soft">· {formatDate(b.date)}</span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    {b.type === "apmdc_invoice" ? "No matching Transit Form" : "No matching APMDC bill"} for {b.vehicleNo || "this truck"} ·{" "}
                    {formatQty(b.qty)}
                  </p>
                </div>
                <BillTypeChip type={b.type} size="sm" />
                <ChevronRight className="size-5 text-ink-faint" />
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle
          action={
            <Link href="/bills" className="text-sm font-semibold text-clay hover:text-clay-dark">
              See all bills →
            </Link>
          }
        >
          Recently saved
        </SectionTitle>
        {!data ? (
          <BillListSkeleton rows={3} />
        ) : data.recent.length === 0 ? (
          <Card className="p-6 text-center text-ink-soft">No bills yet. Scan your first bill to get started.</Card>
        ) : (
          <div className="space-y-3">
            {data.recent.map((b) => (
              <BillCard key={b.id} bill={b} showType />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
