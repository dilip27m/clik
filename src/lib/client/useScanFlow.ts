"use client";

import { useCallback, useState } from "react";
import { Bill, BillData, BillType, BILL_TYPES } from "@/lib/bill-types";
import type { Credits } from "@/components/CreditsBadge";
import { api, ApiError } from "./api";
import { PreparedPhoto, photoProblem, preparePhoto } from "./image";
import type { ExtractResponse } from "./types";

export type ScanStep =
  | { step: "pick" }
  | { step: "checking" }
  | { step: "blurry"; photo: PreparedPhoto; reason: string }
  | { step: "reading"; photo: PreparedPhoto }
  | { step: "retake"; photo: PreparedPhoto; reason: string; draft?: Draft }
  | { step: "failed"; photo: PreparedPhoto; reason: string; outOfCredits?: boolean; resetsAt?: string }
  | { step: "choose-type"; photo?: PreparedPhoto }
  | { step: "review"; photo?: PreparedPhoto; draft: Draft; existingId?: number | null }
  | { step: "saved"; bill: Bill };

export interface Draft {
  type: BillType;
  company?: string | null; // detected from the bill
  data: BillData;
  unsure: string[];
}

// The whole "photo → read → check → save" journey for one bill at a time.
// Several photos picked on a computer wait in a queue; each is read only
// after the previous one is saved, so every bill is checked by a person.
export function useScanFlow(company: string) {
  const [state, setState] = useState<ScanStep>({ step: "pick" });
  const [queue, setQueue] = useState<File[]>([]);
  const [credits, setCredits] = useState<Credits | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; existingId?: number } | null>(null);

  const read = useCallback(async (photo: PreparedPhoto) => {
    setState({ step: "reading", photo });
    try {
      const res = await api<ExtractResponse>("/api/extract", { body: { image: photo.base64, mime: "image/jpeg", company } });
      if (res.credits) setCredits(res.credits);
      if (res.ok) {
        setState({
          step: "review",
          photo,
          draft: { type: res.type, company: res.company, data: res.data, unsure: res.unsure },
          existingId: res.existingId,
        });
      } else if (res.retake) {
        setState({ step: "retake", photo, reason: res.reason, draft: res.draft && { ...res.draft } });
      } else {
        setState({ step: "failed", photo, reason: res.reason, outOfCredits: res.outOfCredits, resetsAt: res.resetsAt });
      }
    } catch (e) {
      setState({ step: "failed", photo, reason: e instanceof Error ? e.message : "Could not read the bill." });
    }
  }, [company]);

  const start = useCallback(
    async (file: File) => {
      setSaveError(null);
      setState({ step: "checking" });
      try {
        const photo = await preparePhoto(file);
        const problem = photoProblem(photo);
        if (problem) setState({ step: "blurry", photo, reason: problem });
        else await read(photo);
      } catch (e) {
        setState({ step: "pick" });
        alert(e instanceof Error ? e.message : "Could not open this photo.");
      }
    },
    [read]
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      setQueue(files.slice(1));
      start(files[0]);
    },
    [start]
  );

  const next = useCallback(() => {
    const [first, ...rest] = queue;
    setQueue(rest);
    if (first) start(first);
    else setState({ step: "pick" });
  }, [queue, start]);

  const save = useCallback(
    async (type: BillType, data: BillData, billCompany: string, photo?: PreparedPhoto) => {
      setSaving(true);
      setSaveError(null);
      try {
        const res = await api<{ bill: Bill }>("/api/bills", {
          body: { type, data, company: billCompany, photo: photo?.base64, mime: "image/jpeg" },
        });
        setState({ step: "saved", bill: res.bill });
      } catch (e) {
        const existingId = e instanceof ApiError ? (e.body.existingId as number | undefined) : undefined;
        setSaveError({ message: e instanceof Error ? e.message : "Could not save", existingId });
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const enterByHand = useCallback((type: BillType, photo?: PreparedPhoto) => {
    const data = Object.fromEntries(BILL_TYPES[type].fields.map((f) => [f.key, null]));
    setState({ step: "review", photo, draft: { type, data, unsure: [] } });
  }, []);

  return {
    state,
    setState,
    queueLeft: queue.length,
    credits,
    setCredits,
    saving,
    saveError,
    addFiles,
    read,
    next,
    save,
    enterByHand,
    reset: () => {
      setQueue([]);
      setSaveError(null);
      setState({ step: "pick" });
    },
  };
}
