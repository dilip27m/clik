"use client";

import { useEffect } from "react";
import { HomeResponse } from "@/lib/client/types";
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
  const flow = useScanFlow();
  const { state } = flow;
  const { inputs, openCamera, openGallery } = usePhotoInputs(flow.addFiles);

  // Credits come with the home data; after each scan the server sends fresh numbers.
  const home = useCached<HomeResponse>("/api/home");
  const { setCredits } = flow;
  useEffect(() => {
    if (home.data?.credits) setCredits((c) => c ?? home.data!.credits);
  }, [home.data, setCredits]);

  const retake = () => {
    flow.reset();
    openCamera();
  };

  let body: React.ReactNode;
  switch (state.step) {
    case "pick":
      body = (
        <PickStep
          credits={flow.credits}
          onCamera={openCamera}
          onGallery={openGallery}
          onByHand={() => flow.setState({ step: "choose-type" })}
        />
      );
      break;
    case "checking":
      body = <ReadingStep label="Checking the photo…" />;
      break;
    case "reading":
      body = <ReadingStep src={state.photo.dataUrl} />;
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
          onSave={(type, data) => flow.save(type, data, state.photo)}
          onChangeType={(type) => flow.setState({ ...state, draft: { ...state.draft, type, unsure: [] } })}
          onCancel={flow.reset}
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
