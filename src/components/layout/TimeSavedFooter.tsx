"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCached } from "@/lib/client/useCached";
import { teasingLine } from "@/lib/time-saved";

// "Nanna, I've saved you 2 hr 10 min…" — total across all saved bills.
// Refreshes on every page change, so it grows right after each new bill.
export function TimeSavedFooter() {
  const path = usePathname();
  const { data, reload } = useCached<{ bills: number; seconds: number }>("/api/time-saved");
  const [pick, setPick] = useState(0);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new joke on each page
    setPick((p) => p + 1);
  }, [path, reload]);

  if (!data) return null;
  return (
    <footer className="mt-12 rounded-2xl border border-dashed border-clay/30 bg-clay-soft/40 px-5 py-4 text-center">
      <p className="font-display text-lg leading-snug text-clay-dark">{teasingLine(data.seconds, data.bills, pick)}</p>
    </footer>
  );
}
