"use client";

import { Camera, Images } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Big "Scan" button with a small "Photos" button beside it (like the scan +
// gallery buttons in payment apps). Photos lets you pick several bills at once.
export function ScanActions({ onCamera, onPhotos, disabled }: { onCamera: () => void; onPhotos: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-stretch gap-3">
      <Button size="xl" className="flex-1 px-4 whitespace-nowrap" icon={<Camera className="size-7" />} onClick={onCamera} disabled={disabled}>
        Scan Bill
      </Button>
      <button
        type="button"
        onClick={onPhotos}
        disabled={disabled}
        aria-label="Choose photos from the phone"
        className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-line-strong bg-paper font-semibold text-ink shadow-card transition hover:border-clay/40 hover:text-clay-dark disabled:opacity-50"
      >
        <Images className="size-6" />
        <span className="text-sm">Photos</span>
      </button>
    </div>
  );
}
