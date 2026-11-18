"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bill, BillData, BillType } from "@/lib/bill-types";
import type { ScanJob } from "@/lib/jobs";
import type { Credits } from "@/components/CreditsBadge";
import { api } from "./api";
import { photoProblem, preparePhoto } from "./image";

export type { ScanJob };

export const isReading = (j: ScanJob) => j.status === "queued" || j.status === "reading";

export interface UploadProgress {
  done: number;
  total: number;
  failed: number;
  startedAt: number;
}

// The batch of photos for one company. The list lives on the server, so it is
// the same after closing the app; this hook only shows it and sends actions.
export function useBatch(company: string) {
  const [jobs, setJobs] = useState<ScanJob[] | null>(null);
  const [credits, setCredits] = useState<Credits | undefined>();
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const [uploadFailed, setUploadFailed] = useState(0);
  // Server clock minus phone clock, so times from the server line up.
  const [offsetMs, setOffsetMs] = useState(0);
  // When the person started this batch (kept after uploading finishes).
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const uploading = useRef(false);
  const companyRef = useRef(company);
  useEffect(() => {
    companyRef.current = company;
  }, [company]);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ jobs: ScanJob[]; credits: Credits; now: string }>(`/api/scan-jobs?company=${company}`);
      if (companyRef.current !== company) return;
      setJobs(r.jobs);
      setCredits(r.credits);
      setOffsetMs(Date.parse(r.now) - Date.now());
      if (!uploading.current && !r.jobs.some(isReading)) setStartedAt(null);
    } catch {
      // keep showing the last known list; the next refresh will try again
    }
  }, [company]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the batch for this company
    refresh();
  }, [refresh]);

  // Check every 2 s while photos are being uploaded or read.
  const active = upload !== null || (jobs ?? []).some(isReading);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [active, refresh]);

  // Coming back to the app (unlocked phone, reopened tab): show the latest.
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [refresh]);

  const addPhotos = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const progress: UploadProgress = { done: 0, total: files.length, failed: 0, startedAt: Date.now() };
      setStartedAt((s) => s ?? progress.startedAt);
      uploading.current = true;
      setUpload({ ...progress });
      setUploadFailed(0);
      for (const file of files) {
        try {
          const photo = await preparePhoto(file);
          await api("/api/scan-jobs", {
            body: { image: photo.base64, mime: "image/jpeg", company, blurry: photoProblem(photo) ?? undefined },
          });
        } catch {
          progress.failed++;
        }
        progress.done++;
        setUpload({ ...progress });
        refresh();
      }
      uploading.current = false;
      setUpload(null);
      setUploadFailed(progress.failed);
      refresh();
    },
    [company, refresh]
  );

  const retry = useCallback(
    async (id: number) => {
      setJobs((js) => js?.map((j) => (j.id === id ? { ...j, status: "queued", error: null } : j)) ?? null);
      await api(`/api/scan-jobs/${id}/retry`, { method: "POST" }).catch(() => {});
      refresh();
    },
    [refresh]
  );

  const reject = useCallback(async (id: number) => {
    setJobs((js) => js?.filter((j) => j.id !== id) ?? null);
    await api(`/api/scan-jobs/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  // Throws ApiError (e.g. 409 already saved) so the caller can show it.
  const confirm = useCallback(async (id: number, type: BillType, data: BillData, billCompany: string) => {
    const r = await api<{ bill: Bill }>(`/api/scan-jobs/${id}/confirm`, { body: { type, data, company: billCompany } });
    setJobs((js) => js?.filter((j) => j.id !== id) ?? null);
    return r.bill;
  }, []);

  return { jobs, credits, upload, uploadFailed, offsetMs, startedAt, addPhotos, retry, reject, confirm, refresh };
}
