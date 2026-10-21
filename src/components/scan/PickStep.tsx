"use client";

import { Camera, Images, Keyboard } from "lucide-react";
import { BILL_TYPES, BILL_TYPE_ORDER } from "@/lib/bill-types";
import { BillTypeChip } from "@/components/bill/billStyle";
import { CreditsBadge, Credits } from "@/components/CreditsBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface Props {
  credits?: Credits;
  onCamera: () => void;
  onGallery: () => void;
  onByHand: () => void;
}

export function PickStep({ credits, onCamera, onGallery, onByHand }: Props) {
  const outOfScans = credits?.left === 0;
  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Scan a bill</h1>
        <p className="mt-1 text-ink-soft">Lay the bill flat in good light and fit the whole bill in the photo.</p>
      </div>

      <CreditsBadge credits={credits} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Button size="xl" full icon={<Camera className="size-7" />} onClick={onCamera} disabled={outOfScans}>
          Take Photo
        </Button>
        <Button size="xl" variant="secondary" full icon={<Images className="size-7" />} onClick={onGallery} disabled={outOfScans}>
          Choose from Gallery
        </Button>
      </div>

      <button onClick={onByHand} className="flex w-full items-center justify-center gap-2 py-2 font-medium text-clay hover:text-clay-dark">
        <Keyboard className="size-5" /> Type the bill in by hand instead
      </button>

      <Card className="p-5">
        <p className="mb-3 font-semibold text-ink">The app understands these 4 bills</p>
        <ul className="space-y-3">
          {BILL_TYPE_ORDER.map((t) => (
            <li key={t} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <BillTypeChip type={t} size="sm" />
              <span className="text-sm text-ink-soft">{BILL_TYPES[t].hint}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
