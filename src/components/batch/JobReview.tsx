"use client";

import { useState } from "react";
import { ArrowLeft, RotateCcw, X } from "lucide-react";
import type { BillData, BillType } from "@/lib/bill-types";
import { ApiError } from "@/lib/client/api";
import type { ScanJob } from "@/lib/client/useBatch";
import { BillCheck } from "@/components/bill/BillCheck";
import { BillPhoto } from "@/components/bill/BillPhoto";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

interface Props {
  job: ScanJob;
  activeCompany: string;
  onConfirm: (type: BillType, data: BillData, company: string) => Promise<void>;
  onReject: () => void;
  onRetry: () => void;
  onBack: () => void;
}

// One photo from the batch, opened from the table: compare, fix, confirm or reject.
export function JobReview({ job, activeCompany, onConfirm, onReject, onRetry, onBack }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; existingId?: number } | null>(null);
  const photoSrc = `/api/scan-jobs/${job.id}/photo`;

  const back = (
    <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 font-medium text-ink-soft hover:text-clay">
      <ArrowLeft className="size-5" /> All bills in this batch
    </button>
  );

  // Nothing could be read: show the photo with Retry / Reject.
  if (!job.result) {
    return (
      <div className="mx-auto max-w-md space-y-5 animate-rise">
        {back}
        <BillPhoto src={photoSrc} className="max-h-[45vh]" />
        <Notice tone={job.status === "failed" ? "error" : "warn"} title="This photo could not be read">
          {job.error}
        </Notice>
        <div className="space-y-3">
          <Button size="lg" full icon={<RotateCcw className="size-5" />} onClick={onRetry}>
            {job.status === "failed" ? "Retry" : "Read anyway"}
          </Button>
          <Button size="lg" variant="ghost" full icon={<X className="size-5" />} onClick={onReject}>
            Reject this photo
          </Button>
        </div>
      </div>
    );
  }

  const save = async (type: BillType, data: BillData, company: string) => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(type, data, company);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Could not save", existingId: e instanceof ApiError ? (e.body.existingId as number) : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {back}
      {job.status === "check" && job.error && (
        <div className="mb-4">
          <Notice tone="warn" title="The photo was not very clear">
            {job.error} Check every field carefully.
          </Notice>
        </div>
      )}
      <BillCheck
        photoSrc={photoSrc}
        draft={job.result}
        activeCompany={activeCompany}
        existingId={job.existingId}
        saving={saving}
        error={error}
        submitLabel="Confirm & save"
        onSave={save}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={onRetry}>
              Read again
            </Button>
            <Button type="button" variant="ghost" icon={<X className="size-5" />} onClick={onReject}>
              Reject
            </Button>
          </div>
        }
      />
    </div>
  );
}
