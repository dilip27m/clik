"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMonth } from "@/lib/bill-types";
import { useCompany } from "@/lib/client/company";
import { setPendingPhotos } from "@/lib/client/pendingPhotos";
import { useCached } from "@/lib/client/useCached";
import type { HomeResponse } from "@/lib/client/types";
import { BillCard, BillListSkeleton } from "@/components/bill/BillCard";
import { CreditsBadge } from "@/components/CreditsBadge";
import { InstallApp } from "@/components/InstallApp";
import { MonthSelect } from "@/components/bills/MonthSelect";
import { MonthSummary } from "@/components/home/MonthSummary";
import { ScanActions } from "@/components/scan/ScanActions";
import { usePhotoInputs } from "@/components/scan/usePhotoInputs";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const { company, info } = useCompany();
  const [month, setMonth] = useState(""); // "" = all months, like the Bills page
  const { data, error } = useCached<HomeResponse>(`/api/home?company=${company}${month ? `&month=${month}` : ""}`);
  const isCurrent = month === new Date().toISOString().slice(0, 7);

  // Scan / Photos open the camera or gallery right here, then the Scan page reads them.
  const router = useRouter();
  const { inputs, openCamera, openGallery } = usePhotoInputs((files) => {
    if (!files.length) return;
    setPendingPhotos(files);
    router.push("/scan");
  });

  return (
    <div className="space-y-8">
      {inputs}
      <section className="animate-rise">
        <p className="text-ink-soft">{greeting()} 🙏</p>
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">What bill do you have today?</h1>
      </section>

      <InstallApp />

      <Card className="overflow-hidden">
        <div className="bg-[radial-gradient(120%_120%_at_100%_0%,#f6e3d6_0%,transparent_60%)] p-5 sm:p-6">
          <p className="mb-4 max-w-md text-ink-soft">
            Take a photo of a bill, or pick several from <b className="font-semibold text-ink">Photos</b>. The app reads each one, you check
            it, and it goes into the Google Sheet.
          </p>
          <div className="max-w-md">
            <ScanActions onCamera={openCamera} onPhotos={openGallery} disabled={data?.credits.left === 0} />
          </div>
          <div className="mt-4">
            <CreditsBadge credits={data?.credits} compact />
          </div>
        </div>
      </Card>

      {error && !data && <Notice tone="error" title="Could not load">{error}</Notice>}

      <section>
        <SectionTitle action={<MonthSelect value={month} className="h-10 text-sm" onChange={setMonth} />}>
          {info.short} · {month ? formatMonth(month) : "All months"}
          {isCurrent && " so far"}
        </SectionTitle>
        <MonthSummary stats={data?.stats} />
      </section>


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
