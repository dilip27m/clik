"use client";

import { Camera, Clock, RotateCcw } from "lucide-react";
import { refillText } from "@/components/CreditsBadge";
import { Button } from "@/components/ui/Button";

interface Props {
  src: string;
  title: string;
  reason: string;
  resetsAt?: string;
  onRetake: () => void;
  retakeLabel?: string;
  onContinue?: () => void;   // use this photo anyway
  continueLabel?: string;
  onByHand?: () => void;
}

// Shown when the photo is blurry, cut off, or the reader is busy/out of scans.
export function ProblemStep({ src, title, reason, resetsAt, onRetake, retakeLabel = "Retake Photo", onContinue, continueLabel, onByHand }: Props) {
  return (
    <div className="mx-auto max-w-md space-y-5 animate-rise">
      <div className="overflow-hidden rounded-2xl border-2 border-gold/60 bg-[#efe6d8]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Your photo" className="max-h-[42vh] w-full object-contain" />
      </div>
      <div className="text-center">
        <h2 className="font-display text-2xl font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-lg text-ink-soft">{reason}</p>
        {resetsAt && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-gold-soft px-4 py-1.5 font-semibold text-gold">
            <Clock className="size-4" /> {refillText(resetsAt)}
          </p>
        )}
      </div>
      <div className="space-y-3">
        <Button size="xl" full onClick={onRetake} icon={retakeLabel.startsWith("Try") ? <RotateCcw className="size-6" /> : <Camera className="size-6" />}>
          {retakeLabel}
        </Button>
        {onContinue && (
          <Button size="lg" variant="secondary" full onClick={onContinue}>
            {continueLabel}
          </Button>
        )}
        {onByHand && (
          <Button size="lg" variant="ghost" full onClick={onByHand}>
            Type it in by hand
          </Button>
        )}
      </div>
    </div>
  );
}
