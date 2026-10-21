"use client";

import { useState } from "react";
import { X, ZoomIn } from "lucide-react";

// Bill photo with a tap-to-enlarge full-screen view for checking small numbers.
export function BillPhoto({ src, alt = "Bill photo", className = "" }: { src: string; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block w-full overflow-hidden rounded-2xl border border-line bg-[#efe6d8] ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data URLs and Drive links */}
        <img src={src} alt={alt} className="h-full w-full object-contain" />
        <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-ink/75 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
          <ZoomIn className="size-4" /> Tap to zoom
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/95" onClick={() => setOpen(false)}>
          <div className="flex justify-end p-3">
            <button className="rounded-full bg-white/10 p-3 text-white" aria-label="Close">
              <X className="size-6" />
            </button>
          </div>
          <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="mx-auto w-[160%] max-w-none sm:w-auto sm:max-w-full" />
          </div>
        </div>
      )}
    </>
  );
}
