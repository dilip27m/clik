"use client";

import { useRef } from "react";

// Hidden file inputs for "camera" and "gallery". openCamera/openGallery must be
// called from a click so the phone lets us open them.
export function usePhotoInputs(onFiles: (files: File[]) => void) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    e.target.value = ""; // allow picking the same photo again
    onFiles(files);
  };

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={handle} />
    </>
  );

  return {
    inputs,
    openCamera: () => camera.current?.click(),
    openGallery: () => gallery.current?.click(),
  };
}
