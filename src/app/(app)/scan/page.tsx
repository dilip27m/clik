"use client";

import { useEffect } from "react";
import type { MetaResponse } from "@/lib/client/types";
import { takePendingPhotos } from "@/lib/client/pendingPhotos";
import { takeSharedPhotos } from "@/lib/client/sharedPhotos";
import { useCompany } from "@/lib/client/company";
import { useCached } from "@/lib/client/useCached";
import { useScanFlow } from "@/lib/client/useScanFlow";
import { PickStep } from "@/components/scan/PickStep";
import { ProblemStep } from "@/components/scan/ProblemStep";
import { ReadingStep } from "@/components/scan/ReadingStep";
import { ReviewStep } from "@/components/scan/ReviewStep";
import { SavedStep } from "@/components/scan/SavedStep";
import { TypeChooser } from "@/components/scan/TypeChooser";
import { usePhotoInputs } from "@/components/scan/usePhotoInputs";
import { Button } from "@/components/ui/Button";

export default function ScanPage() {
  const { company } = useCompany();
  const flow = useScanFlow(company);
  const { state } = flow;
  const { inputs, openCamera, openGallery } = usePhotoInputs(flow.addFiles);

  // Credits load with the page; after each scan the server sends fresh numbers.
  const meta = useCached<MetaResponse>(`/api/meta?company=${company}`);
  const { setCredits, addFiles } = flow;
  useEffect(() => {
    if (meta.data?.credits) setCredits((c) => c ?? meta.data!.credits);
  }, [meta.data, setCredits]);

  // Photos picked with the Photos button on Home: start reading them right away.
  useEffect(() => {
    const files = takePendingPhotos();
    if (files.length) addFiles(files);
  }, [addFiles]);

  // Opened by "Share → Bill Book" from WhatsApp or Gallery: read the shared photo right away.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("shared")) return;
    window.history.replaceState(null, "", "/scan");
    takeSharedPhotos().then((files) => {
      if (files.length) addFiles(files);
    });
  }, [addFiles]);

  // Retake keeps any other photos that are still waiting.
  const retake = () => {
    flow.backToPick();
    openCamera();
  };
  const skip = flow.queueLeft > 0 ? flow.next : undefined;

  let body: React.ReactNode;
  switch (state.step) {
    case "pick":
      body = (
        <PickStep
          credits={flow.credits}
          queueLeft={flow.queueLeft}
          onCamera={openCamera}
          onGallery={openGallery}
          onContinueQueue={flow.next}
          onByHand={() => flow.setState({ step: "choose-type" })}
        />
      );
      break;
    case "checking":
      body = <ReadingStep />;
      break;
    case "reading":
      body = <ReadingStep src={state.photo.dataUrl} progress={state.progress} />;
      break;
    case "blurry":
      body = (
        <ProblemStep
          src={state.photo.dataUrl}
          title="Please retake the photo"
          reason={state.reason}
          onRetake={retake}
          onContinue={() => flow.read(state.photo)}
          continueLabel="The photo is fine — read it anyway"
          queueLeft={flow.queueLeft}
          onSkip={skip}
        />
      );
      break;
    case "retake":
      body = (
        <ProblemStep
          src={state.photo.dataUrl}
          title="Please retake the photo"
          reason={state.reason}
          onRetake={retake}
          onContinue={state.draft ? () => flow.setState({ step: "review", photo: state.photo, draft: state.draft! }) : undefined}
          continueLabel="Use this photo and check every field"
          queueLeft={flow.queueLeft}
          onSkip={skip}
        />
      );
      break;
    case "failed":
      body = (
        <ProblemStep
          src={state.photo.dataUrl}
          title={state.outOfCredits ? "No free scans left today" : "Could not read the bill"}
          reason={state.outOfCredits ? "Google gives a fixed number of free scans each day." : state.reason}
          resetsAt={state.resetsAt}
          retakeLabel={state.outOfCredits ? "Take a new photo later" : "Try again"}
          onRetake={state.outOfCredits ? flow.reset : () => flow.read(state.photo)}
          onByHand={() => flow.setState({ step: "choose-type", photo: state.photo })}
          queueLeft={flow.queueLeft}
          onSkip={skip}
        />
      );
      break;
    case "choose-type":
      body = (
        <div className="mx-auto max-w-xl space-y-5 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">Which bill is it?</h1>
            <p className="mt-1 text-ink-soft">Pick the bill type, then type in the details.</p>
          </div>
          <TypeChooser onChoose={(t) => flow.enterByHand(t, state.photo)} />
          <Button variant="ghost" full onClick={flow.reset}>
            Back
          </Button>
        </div>
      );
      break;
    case "review":
      body = (
        <ReviewStep
          photo={state.photo}
          draft={state.draft}
          existingId={state.existingId}
          saving={flow.saving}
          saveError={flow.saveError}
          queueLeft={flow.queueLeft}
          onSave={(type, data, billCompany) => flow.save(type, data, billCompany, state.photo)}
          onChangeType={(type) => flow.setState({ ...state, draft: { ...state.draft, type, unsure: [] } })}
          activeCompany={company}
          onCancel={skip ?? flow.reset}
        />
      );
      break;
    case "saved":
      body = <SavedStep bill={state.bill} queueLeft={flow.queueLeft} onNext={flow.queueLeft > 0 ? flow.next : retake} />;
      break;
  }

  return (
    <>
      {inputs}
      {body}
    </>
  );
}
