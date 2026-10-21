"use client";

import Link from "next/link";
import { useState } from "react";
import { BillData, BillType } from "@/lib/bill-types";
import type { PreparedPhoto } from "@/lib/client/image";
import type { Draft } from "@/lib/client/useScanFlow";
import { BillForm } from "@/components/bill/BillForm";
import { BillPhoto } from "@/components/bill/BillPhoto";
import { BillTypeChip } from "@/components/bill/billStyle";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TypeChooser } from "./TypeChooser";

interface Props {
  photo?: PreparedPhoto;
  draft: Draft;
  existingId?: number | null;
  saving: boolean;
  saveError: { message: string; existingId?: number } | null;
  queueLeft: number;
  onSave: (type: BillType, data: BillData) => void;
  onChangeType: (t: BillType) => void;
  onCancel: () => void;
}

// Photo next to the read values — the person checks and saves.
export function ReviewStep({ photo, draft, existingId, saving, saveError, queueLeft, onSave, onChangeType, onCancel }: Props) {
  const [choosingType, setChoosingType] = useState(false);
  const dupId = saveError?.existingId ?? existingId;

  return (
    <div className="animate-rise">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Check and save</h1>
        <BillTypeChip type={draft.type} />
        <button onClick={() => setChoosingType((v) => !v)} className="text-sm font-semibold text-clay underline-offset-4 hover:underline">
          {choosingType ? "Keep this type" : "Wrong type?"}
        </button>
        {queueLeft > 0 && <span className="ml-auto text-sm text-ink-soft">{queueLeft} more photo{queueLeft > 1 ? "s" : ""} waiting</span>}
      </div>

      {choosingType && (
        <div className="mb-6">
          <TypeChooser
            current={draft.type}
            onChoose={(t) => {
              setChoosingType(false);
              onChangeType(t);
            }}
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start">
        {photo && (
          <div className="md:sticky md:top-20">
            <BillPhoto src={photo.dataUrl} className="max-h-[45vh] md:max-h-[75vh]" />
          </div>
        )}
        <div className="space-y-4">
          {dupId ? (
            <Notice
              tone="warn"
              title="This bill is already saved"
              action={
                <Link href={`/bills/${dupId}`} className="font-semibold underline underline-offset-4">
                  Open the saved bill
                </Link>
              }
            >
              Saving again is not needed. Check the bill number if this is a different bill.
            </Notice>
          ) : (
            saveError && <Notice tone="error" title="Not saved">{saveError.message}</Notice>
          )}
          <BillForm
            key={draft.type}
            type={draft.type}
            initial={draft.data}
            unsure={draft.unsure}
            saving={saving}
            submitLabel="Save bill"
            onSubmit={(data) => onSave(draft.type, data)}
            footer={
              <Button type="button" variant="ghost" full onClick={onCancel}>
                Cancel
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
