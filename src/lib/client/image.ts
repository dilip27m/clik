"use client";

// Below these the photo is very unlikely to read well (tuned on the sample
// bills: the one blurry photo scored 166, every readable one 288+).
export const BLUR_LIMIT = 200;
export const DARK_LIMIT = 70;

export interface PreparedPhoto {
  dataUrl: string;     // compressed JPEG, shown on screen and sent to the server
  base64: string;
  sharpness: number;   // higher = sharper
  brightness: number;  // 0–255
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error("This file is not a photo."));
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Variance of the Laplacian on an 800px-wide greyscale copy: a standard blur score.
function measure(img: HTMLImageElement): { sharpness: number; brightness: number } {
  const w = 800;
  const h = Math.round((img.height * w) / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const grey = new Float32Array(w * h);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    grey[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    total += grey[i];
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - 1] + grey[i + 1] + grey[i - w] + grey[i + w] - 4 * grey[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return { sharpness: sumSq / n - mean * mean, brightness: total / (w * h) };
}

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const img = await loadImage(file);
  const { sharpness, brightness } = measure(img);
  const dataUrl = drawScaled(img, 1600).toDataURL("image/jpeg", 0.82);
  return { dataUrl, base64: dataUrl.split(",")[1], sharpness, brightness };
}

export function photoProblem(p: PreparedPhoto): string | null {
  if (p.brightness < DARK_LIMIT) return "The photo is too dark. Please take it again in good light.";
  if (p.sharpness < BLUR_LIMIT) return "The photo looks blurry. Please hold the phone steady and take it again.";
  return null;
}
