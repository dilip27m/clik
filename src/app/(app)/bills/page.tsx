"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, ExternalLink, Search } from "lucide-react";
import { BILL_TYPES, Bill, BillType, isBillType } from "@/lib/bill-types";
import { useCached } from "@/lib/client/useCached";
import type { HomeResponse } from "@/lib/client/types";
import { BillCard, BillListSkeleton } from "@/components/bill/BillCard";
import { MonthSelect } from "@/components/bills/MonthSelect";
import { Totals } from "@/components/bills/Totals";
import { TypeTabs } from "@/components/bills/TypeTabs";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

function BillsView() {
  const router = useRouter();
  const params = useSearchParams();
  const t = params.get("type");
  const type: BillType = isBillType(t) ? t : "transit_in";
  const month = params.get("month") ?? new Date().toISOString().slice(0, 7);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = new URLSearchParams({ type, month, ...(q ? { q } : {}) }).toString();
  const { data, error, loading } = useCached<{ bills: Bill[] }>(`/api/bills?${query}`);
  const sheetUrl = useCached<HomeResponse>("/api/home").data?.sheetUrl;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`/bills?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">Bills</h1>
        <div className="flex gap-2">
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-paper px-4 font-semibold text-ink shadow-card hover:text-clay-dark"
            >
              <ExternalLink className="size-4" /> Google Sheet
            </a>
          )}
          <a
            href={`/api/export${month ? `?month=${month}` : ""}`}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-paper px-4 font-semibold text-ink shadow-card hover:text-clay-dark"
          >
            <Download className="size-4" /> Excel
          </a>
        </div>
      </div>

      <TypeTabs value={type} onChange={(v) => setParam("type", v)} />

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, name or vehicle"
            className="h-12 w-full rounded-xl border border-line-strong bg-paper pr-3 pl-11 text-ink outline-none placeholder:text-ink-faint focus:border-clay focus:ring-4 focus:ring-clay/20"
          />
        </label>
        <MonthSelect value={month} onChange={(m) => setParam("month", m)} />
      </div>

      {data && <Totals type={type} bills={data.bills} />}
      {error && <Notice tone="error" title="Could not load bills">{error}</Notice>}

      {!data && loading ? (
        <BillListSkeleton />
      ) : data && data.bills.length === 0 ? (
        <Card className="p-8 text-center text-ink-soft">
          No {BILL_TYPES[type].name} bills {q ? "match your search" : "for this month"}.
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.bills.map((b) => (
            <BillCard key={b.id} bill={b} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function BillsPage() {
  return (
    <Suspense fallback={<BillListSkeleton />}>
      <BillsView />
    </Suspense>
  );
}
