"use client";

import { useEffect, useRef, useState } from "react";
import { BILL_TYPES, type BillType } from "@/lib/bill-types";
import { api, ApiError } from "@/lib/client/api";
import { useCompany } from "@/lib/client/company";
import { takePendingPhotos } from "@/lib/client/pendingPhotos";
import { takeSharedPhotos } from "@/lib/client/sharedPhotos";
import { isReading, useBatch, type ScanJob } from "@/lib/client/useBatch";
import { BatchProgress } from "@/components/batch/BatchProgress";
import { BatchTable } from "@/components/batch/BatchTable";
import { JobReview } from "@/components/batch/JobReview";
import { BillListSkeleton } from "@/components/bill/BillCard";
import { BillCheck } from "@/components/bill/BillCheck";
import { PickStep } from "@/components/scan/PickStep";
import { ScanActions } from "@/components/scan/ScanActions";
import { TypeChooser } from "@/components/scan/TypeChooser";
import { usePhotoInputs } from "@/components/scan/usePhotoInputs";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

type Manual = null | "choose" | BillType;

export default function ScanPage() {
  const { company } = useCompany();
  const batch = useBatch(company);
  const { jobs, upload, addPhotos } = batch;
  const [openId, setOpenId] = useState<number | null>(null);
  const [manual, setManual] = useState<Manual>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const autoOpen = useRef(false); // a single photo opens by itself when read

  const add = (files: File[]) => {
    if (!files.length) return;
    autoOpen.current = files.length === 1 && (jobs ?? []).length === 0;
    setOpenId(null);
    addPhotos(files);
  };
  const { inputs, openCamera, openGallery } = usePhotoInputs(add);

  // Photos picked on Home, or shared from WhatsApp / Gallery.
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  useEffect(() => {
    const files = takePendingPhotos();
    if (files.length) addRef.current(files);
    if (new URLSearchParams(window.location.search).has("shared")) {
      window.history.replaceState(null, "", "/scan");
      takeSharedPhotos().then((shared) => addRef.current(shared));
    }
  }, []);

  useEffect(() => {
    if (!autoOpen.current || !jobs || jobs.length !== 1 || isReading(jobs[0])) return;
    autoOpen.current = false;
    setOpenId(jobs[0].id); // open the single photo once it has been read
  }, [jobs]);

  useEffect(() => {
    if (!savedMsg) return;
    const t = setTimeout(() => setSavedMsg(null), 5000);
    return () => clearTimeout(t);
  }, [savedMsg]);

  const confirmJob = async (job: ScanJob, type?: BillType, data?: Record<string, string | number | null>, billCompany?: string) => {
    const r = job.result!;
    const bill = await batch.confirm(job.id, type ?? r.type, data ?? r.data, billCompany ?? r.company ?? company);
    setSavedMsg(`${BILL_TYPES[bill.type].name} ${bill.docNo} saved`);
  };

  const finished = (jobs ?? []).filter((j) => !isReading(j));
  const inProgress = upload !== null || (jobs ?? []).some(isReading);
  const openJob = openId !== null ? (jobs ?? []).find((j) => j.id === openId) : undefined;

  let body: React.ReactNode;

  if (manual) {
    body =
      manual === "choose" ? (
        <div className="mx-auto max-w-xl space-y-5 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">Which bill is it?</h1>
            <p className="mt-1 text-ink-soft">Pick the bill type, then type in the details.</p>
          </div>
          <TypeChooser onChoose={setManual} />
          <Button variant="ghost" full onClick={() => setManual(null)}>
            Back
          </Button>
        </div>
      ) : (
        <ManualEntry
          type={manual}
          company={company}
          onDone={(msg) => {
            setManual(null);
            setSavedMsg(msg);
          }}
          onCancel={() => setManual(null)}
        />
      );
  } else if (openJob && !isReading(openJob)) {
    body = (
      <JobReview
        key={openJob.id}
        job={openJob}
        activeCompany={company}
        onConfirm={async (type, data, billCompany) => {
          await confirmJob(openJob, type, data, billCompany);
          setOpenId(null);
        }}
        onReject={() => {
          batch.reject(openJob.id);
          setOpenId(null);
        }}
        onRetry={() => {
          batch.retry(openJob.id);
          setOpenId(null);
        }}
        onBack={() => setOpenId(null)}
      />
    );
  } else if (jobs === null) {
    body = <BillListSkeleton rows={2} />;
  } else if (!inProgress && finished.length === 0) {
    body = <PickStep credits={batch.credits} onCamera={openCamera} onGallery={openGallery} onByHand={() => setManual("choose")} />;
  } else {
    body = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold text-ink">Your bills</h1>
          <div className="w-full sm:w-80">
            <ScanActions onCamera={openCamera} onPhotos={openGallery} disabled={batch.credits?.left === 0} />
          </div>
        </div>
        {inProgress && (
          <BatchProgress jobs={jobs} upload={upload} resetsAt={batch.credits?.resetsAt} offsetMs={batch.offsetMs} startedAt={batch.startedAt} />
        )}
        {finished.length > 0 && (
          <BatchTable
            jobs={finished}
            onOpen={setOpenId}
            onConfirm={(job) =>
              confirmJob(job).catch((e) => {
                // e.g. already saved: open it so the person sees why
                if (e instanceof ApiError) setOpenId(job.id);
              })
            }
            onReject={batch.reject}
            onRetry={batch.retry}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {inputs}
      {savedMsg && (
        <div className="mb-4">
          <Notice tone="success" title={savedMsg}>
            It will appear in the Google Sheet in a few seconds.
          </Notice>
        </div>
      )}
      {batch.uploadFailed > 0 && !upload && (
        <div className="mb-4">
          <Notice tone="error" title={`${batch.uploadFailed} photo${batch.uploadFailed > 1 ? "s" : ""} could not be sent`}>
            Check the internet and pick them again.
          </Notice>
        </div>
      )}
      {body}
    </>
  );
}

// Typing a bill in by hand (no photo, no AI).
function ManualEntry({ type, company, onDone, onCancel }: { type: BillType; company: string; onDone: (msg: string) => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; existingId?: number } | null>(null);
  const empty = Object.fromEntries(BILL_TYPES[type].fields.map((f) => [f.key, null]));
  return (
    <BillCheck
      draft={{ type, data: empty, unsure: [] }}
      activeCompany={company}
      saving={saving}
      error={error}
      onSave={async (t, data, billCompany) => {
        setSaving(true);
        setError(null);
        try {
          const r = await api<{ bill: { docNo: string } }>("/api/bills", { body: { type: t, data, company: billCompany } });
          onDone(`${BILL_TYPES[t].name} ${r.bill.docNo} saved`);
        } catch (e) {
          setError({ message: e instanceof Error ? e.message : "Could not save", existingId: e instanceof ApiError ? (e.body.existingId as number) : undefined });
        } finally {
          setSaving(false);
        }
      }}
      footer={
        <Button type="button" variant="ghost" full onClick={onCancel}>
          Cancel
        </Button>
      }
    />
  );
}
