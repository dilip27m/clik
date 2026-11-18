"use client";

// Photos picked on Home, handed to the Scan page (same browser tab, so plain
// memory is enough).
let pending: File[] = [];

export function setPendingPhotos(files: File[]) {
  pending = files;
}

export function takePendingPhotos(): File[] {
  const files = pending;
  pending = [];
  return files;
}
