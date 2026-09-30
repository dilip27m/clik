/**
 * Client-side Image Optimization Utility for OCR Extraction
 * 
 * Phone cameras frequently capture 12MP to 64MP photos (4MB - 15MB+).
 * Uncompressed uploads easily exceed Vercel's 4.5MB Serverless Function payload limit,
 * causing 413 Payload Too Large or 504 Function Invocation Timeout errors.
 * 
 * This utility downsizes and compresses images to an optimal resolution (~1600px - 1800px)
 * and JPEG quality (0.85), producing high-clarity OCR inputs of ~250KB - 600KB base64.
 */

export interface OptimizeOptions {
  maxDimension?: number;
  quality?: number;
  maxSizeBytes?: number; // Target max base64 size (default: 1.5MB to be well under Vercel's 4.5MB limit)
}

export async function optimizeImageForOcr(
  source: string | File | Blob,
  options: OptimizeOptions = {}
): Promise<string> {
  const maxDim = options.maxDimension || 1800;
  const initialQuality = options.quality || 0.85;
  const maxSizeBytes = options.maxSizeBytes || 1.5 * 1024 * 1024; // 1.5 MB

  // 1. Get source data URL
  let dataUrl: string;
  if (typeof source === "string") {
    dataUrl = source;
  } else {
    dataUrl = await fileToDataUrl(source);
  }

  // If in SSR environment without window/document, return as is
  if (typeof window === "undefined" || typeof document === "undefined") {
    return dataUrl;
  }

  // 2. Load into Image
  const img = await loadImage(dataUrl);

  // 3. Compute optimal dimensions
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  // 4. Render to Canvas
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(width, 100);
  canvas.height = Math.max(height, 100);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // 5. Compress to JPEG
  let quality = initialQuality;
  let result = canvas.toDataURL("image/jpeg", quality);

  // If still larger than target, iteratively reduce quality and resolution
  let attempts = 0;
  while (result.length > maxSizeBytes && attempts < 3) {
    attempts++;
    quality -= 0.15;
    // Also scale down canvas dimensions by 20%
    const scaleCanvas = document.createElement("canvas");
    scaleCanvas.width = Math.round(canvas.width * 0.8);
    scaleCanvas.height = Math.round(canvas.height * 0.8);
    const sCtx = scaleCanvas.getContext("2d");
    if (sCtx) {
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = "high";
      sCtx.drawImage(canvas, 0, 0, scaleCanvas.width, scaleCanvas.height);
      result = scaleCanvas.toDataURL("image/jpeg", Math.max(quality, 0.5));
    } else {
      result = canvas.toDataURL("image/jpeg", Math.max(quality, 0.5));
    }
  }

  return result;
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = src;
  });
}
