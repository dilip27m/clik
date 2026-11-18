"use client";

import Link from "next/link";
import { useState } from "react";
import { BillData, BillType } from "@/lib/bill-types";
import { getCompany } from "@/lib/companies";
import { BillForm } from "@/components/bill/BillForm";
import { BillPhoto } from "@/components/bill/BillPhoto";
import { BillTypeChip } from "@/components/bill/billStyle";
import { CompanyPicker } from "@/components/CompanyPicker";
import { TypeChooser } from "@/components/scan/TypeChooser";
import { Notice } from "@/components/ui/Notice";

export interface Draft {
  type: BillType;
  company?: string | null; // found on the bill
  data: BillData;
  unsure: string[];
}

interface Props {
  photoSrc?: string;
  draft: Draft;
  activeCompany: string;
  existingId?: number | null;
  saving: boolean;
  error?: { message: string; existingId?: number } | null;
  submitLabel?: string;
  onSave: (type: BillType, data: BillData, company: string) => void;
  footer?: React.ReactNode;
}

// Photo next to the read values: the person checks, fixes and saves.
// Used for photos from a batch and for bills typed in by hand.
export function BillCheck({ photoSrc, draft, activeCompany, existingId, saving, error, submitLabel = "Save bill", onSave, footer }: Props) {
  const [type, setType] = useState(draft.type);
  const [choosingType, setChoosingType] = useState(false);
  const [company, setCompany] = useState(draft.company || activeCompany);
  const dupId = error?.existingId ?? existingId;

  return (
    <div className="animate-rise">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Check and save</h1>
        <BillTypeChip type={type} />
        <button onClick={() => setChoosingType((v) => !v)} className="text-sm font-semibold text-clay underline-offset-4 hover:underline">
          {choosingType ? "Keep this type" : "Wrong type?"}
        </button>
      </div>

      {choosingType && (
        <div className="mb-6">
          <TypeChooser
            current={type}
            onChoose={(t) => {
              setChoosingType(false);
              setType(t);
            }}
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start">
        {photoSrc && (
          <div className="md:sticky md:top-20">
            <BillPhoto src={photoSrc} className="max-h-[45vh] md:max-h-[75vh]" />
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
            error && <Notice tone="error" title="Not saved">{error.message}</Notice>
          )}
          <div className="rounded-2xl border border-line bg-paper p-4">
            <p className="mb-2 text-[0.95rem] font-medium text-ink-soft">
              Which company is this bill for?
              {draft.company && <span className="ml-1 text-leaf">(found on the bill)</span>}
            </p>
            <CompanyPicker value={company} onChange={setCompany} />
            {company !== activeCompany && (
              <p className="mt-2 text-sm text-[#7a5308]">It will be saved under {getCompany(company).name}, not the one selected above.</p>
            )}
          </div>
          <BillForm
            key={type}
            type={type}
            initial={draft.data}
            unsure={type === draft.type ? draft.unsure : []}
            saving={saving}
            submitLabel={submitLabel}
            onSubmit={(data) => onSave(type, data, company)}
            footer={footer}
          />
        </div>
      </div>
    </div>
  );
}
