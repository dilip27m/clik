"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  RotateCw,
  RotateCcw,
  Crop,
  Check,
  X,
  Maximize2,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

interface ImageCropperModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onApplyCrop: (croppedBase64: string) => void;
  docTitle?: string;
}

export default function ImageCropperModal({
  isOpen,
  imageSrc,
  onClose,
  onApplyCrop,
  docTitle = "Document",
}: ImageCropperModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Rotation in degrees: 0, 90, 180, 270
  const [rotation, setRotation] = useState<number>(0);

  // Crop normalized coordinates: 0.0 to 1.0 (relative to displayed image)
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0.05,
    y: 0.05,
    width: 0.9,
    height: 0.9,
  });

  const [isDragging, setIsDragging] = useState<string | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialCrop: typeof crop }>({
    mouseX: 0,
    mouseY: 0,
    initialCrop: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
  });

  // Reset when new image opened
  useEffect(() => {
    if (isOpen) {
      setRotation(0);
      setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
    }
  }, [isOpen, imageSrc]);

  if (!isOpen || !imageSrc) return null;

  // Rotate 90 deg clockwise
  const handleRotateCw = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Rotate 90 deg counter-clockwise
  const handleRotateCcw = () => {
    setRotation((prev) => (prev + 270) % 360);
  };

  // Reset crop to full
  const handleReset = () => {
    setCrop({ x: 0.02, y: 0.02, width: 0.96, height: 0.96 });
    setRotation(0);
  };

  // Aspect ratio presets
  const handleSetAspect = (ratio: "free" | "document" | "landscape") => {
    if (ratio === "document") {
      // ~1:1.41
      setCrop({ x: 0.15, y: 0.05, width: 0.7, height: 0.9 });
    } else if (ratio === "landscape") {
      setCrop({ x: 0.05, y: 0.2, width: 0.9, height: 0.6 });
    } else {
      setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
    }
  };

  // Mouse / Touch handlers for Crop Box
  const handleMouseDown = (handle: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(handle);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      initialCrop: { ...crop },
    };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = (clientX - dragStartRef.current.mouseX) / rect.width;
    const deltaY = (clientY - dragStartRef.current.mouseY) / rect.height;

    const init = dragStartRef.current.initialCrop;
    const updated = { ...crop };

    if (isDragging === "move") {
      updated.x = Math.max(0, Math.min(1 - init.width, init.x + deltaX));
      updated.y = Math.max(0, Math.min(1 - init.height, init.y + deltaY));
    } else if (isDragging === "tl") {
      const newX = Math.max(0, Math.min(init.x + init.width - 0.1, init.x + deltaX));
      const newY = Math.max(0, Math.min(init.y + init.height - 0.1, init.y + deltaY));
      updated.width = init.width + (init.x - newX);
      updated.height = init.height + (init.y - newY);
      updated.x = newX;
      updated.y = newY;
    } else if (isDragging === "tr") {
      const newY = Math.max(0, Math.min(init.y + init.height - 0.1, init.y + deltaY));
      updated.width = Math.max(0.1, Math.min(1 - init.x, init.width + deltaX));
      updated.height = init.height + (init.y - newY);
      updated.y = newY;
    } else if (isDragging === "bl") {
      const newX = Math.max(0, Math.min(init.x + init.width - 0.1, init.x + deltaX));
      updated.width = init.width + (init.x - newX);
      updated.height = Math.max(0.1, Math.min(1 - init.y, init.height + deltaY));
      updated.x = newX;
    } else if (isDragging === "br") {
      updated.width = Math.max(0.1, Math.min(1 - init.x, init.width + deltaX));
      updated.height = Math.max(0.1, Math.min(1 - init.y, init.height + deltaY));
    }

    setCrop(updated);
  };

  const handleMouseUp = () => {
    setIsDragging(null);
  };

  // Perform Final Crop on HTML5 Canvas
  const applyCropAndSave = () => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // 1. Create a canvas for the rotated source
      const rotatedCanvas = document.createElement("canvas");
      const is90or270 = rotation === 90 || rotation === 270;
      rotatedCanvas.width = is90or270 ? img.height : img.width;
      rotatedCanvas.height = is90or270 ? img.width : img.height;

      const rCtx = rotatedCanvas.getContext("2d");
      if (!rCtx) return;

      rCtx.imageSmoothingEnabled = true;
      rCtx.imageSmoothingQuality = "high";
      rCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
      rCtx.rotate((rotation * Math.PI) / 180);
      rCtx.drawImage(img, -img.width / 2, -img.height / 2);

      // 2. Crop from rotated canvas
      const cropX = Math.round(crop.x * rotatedCanvas.width);
      const cropY = Math.round(crop.y * rotatedCanvas.height);
      const cropW = Math.round(crop.width * rotatedCanvas.width);
      const cropH = Math.round(crop.height * rotatedCanvas.height);

      // Downscale if crop dimensions exceed 1800px
      let targetW = Math.max(50, cropW);
      let targetH = Math.max(50, cropH);
      const MAX_DIM = 1800;
      if (targetW > MAX_DIM || targetH > MAX_DIM) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * MAX_DIM) / targetW);
          targetW = MAX_DIM;
        } else {
          targetW = Math.round((targetW * MAX_DIM) / targetH);
          targetH = MAX_DIM;
        }
      }

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = targetW;
      finalCanvas.height = targetH;

      const fCtx = finalCanvas.getContext("2d");
      if (!fCtx) return;

      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = "high";
      fCtx.drawImage(
        rotatedCanvas,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        finalCanvas.width,
        finalCanvas.height
      );

      const croppedBase64 = finalCanvas.toDataURL("image/jpeg", 0.86);
      onApplyCrop(croppedBase64);
      onClose();
    };
    img.src = imageSrc;
  };

  // Skip Crop (Use full image with current rotation, downscaled to safe OCR size)
  const skipCropAndSave = () => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const is90or270 = rotation === 90 || rotation === 270;
      const srcW = is90or270 ? img.height : img.width;
      const srcH = is90or270 ? img.width : img.height;

      let targetW = srcW;
      let targetH = srcH;
      const MAX_DIM = 1800;
      if (targetW > MAX_DIM || targetH > MAX_DIM) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * MAX_DIM) / targetW);
          targetW = MAX_DIM;
        } else {
          targetW = Math.round((targetW * MAX_DIM) / targetH);
          targetH = MAX_DIM;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);

      const drawW = is90or270 ? targetH : targetW;
      const drawH = is90or270 ? targetW : targetH;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

      const rotatedBase64 = canvas.toDataURL("image/jpeg", 0.86);
      onApplyCrop(rotatedBase64);
      onClose();
    };
    img.src = imageSrc;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-2 sm:p-4 select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={handleMouseMove}
      onTouchEnd={handleMouseUp}
    >
      <div className="relative w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="p-3 sm:p-4 border-b border-neutral-800 flex items-center justify-between bg-black/60">
          <div className="flex items-center gap-2">
            <Crop className="h-4 w-4 text-emerald-400" />
            <span className="font-semibold text-xs sm:text-sm text-white">
              Crop & Orient {docTitle}
            </span>
          </div>

          {/* Rotation & Quick Tools */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleRotateCcw}
              className="p-1.5 sm:p-2 rounded bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-700 text-xs flex items-center gap-1 transition"
              title="Rotate 90° Counter-Clockwise"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">-90°</span>
            </button>

            <button
              onClick={handleRotateCw}
              className="p-1.5 sm:p-2 rounded bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-700 text-xs flex items-center gap-1 transition"
              title="Rotate 90° Clockwise"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">+90°</span>
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 sm:p-2 rounded bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-700 text-xs flex items-center gap-1 transition"
              title="Reset Crop & Orientation"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-full bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Interactive Cropper Area */}
        <div className="relative flex-1 min-h-[350px] sm:min-h-[480px] bg-[#030303] flex items-center justify-center p-4 overflow-hidden">
          <div
            ref={containerRef}
            className="relative max-h-[65vh] max-w-full inline-block overflow-hidden rounded border border-neutral-800 shadow-2xl"
          >
            {/* Display Image with CSS Rotation */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop target"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: "transform 0.2s ease-out",
                maxHeight: "65vh",
                maxWidth: "100%",
                display: "block",
              }}
              className="object-contain"
            />

            {/* Dark Mask Outside Crop Area */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(to right, 
                  rgba(0,0,0,0.65) ${crop.x * 100}%, 
                  transparent ${crop.x * 100}%, 
                  transparent ${(crop.x + crop.width) * 100}%, 
                  rgba(0,0,0,0.65) ${(crop.x + crop.width) * 100}%)`,
              }}
            />

            {/* Adjustable Crop Box */}
            <div
              className="absolute border-2 border-emerald-400 cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
              onMouseDown={(e) => handleMouseDown("move", e)}
              onTouchStart={(e) => handleMouseDown("move", e)}
            >
              {/* Internal Grid Lines (Rule of Thirds) */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
                <div className="border-r border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-b border-white"></div>
                <div className="border-r border-white"></div>
                <div className="border-r border-white"></div>
                <div></div>
              </div>

              {/* 4 Corner Drag Handles */}
              {/* Top-Left */}
              <div
                className="absolute -top-2 -left-2 w-4 h-4 bg-emerald-400 border-2 border-black rounded-sm cursor-nwse-resize shadow"
                onMouseDown={(e) => handleMouseDown("tl", e)}
                onTouchStart={(e) => handleMouseDown("tl", e)}
              />
              {/* Top-Right */}
              <div
                className="absolute -top-2 -right-2 w-4 h-4 bg-emerald-400 border-2 border-black rounded-sm cursor-nesw-resize shadow"
                onMouseDown={(e) => handleMouseDown("tr", e)}
                onTouchStart={(e) => handleMouseDown("tr", e)}
              />
              {/* Bottom-Left */}
              <div
                className="absolute -bottom-2 -left-2 w-4 h-4 bg-emerald-400 border-2 border-black rounded-sm cursor-nesw-resize shadow"
                onMouseDown={(e) => handleMouseDown("bl", e)}
                onTouchStart={(e) => handleMouseDown("bl", e)}
              />
              {/* Bottom-Right */}
              <div
                className="absolute -bottom-2 -right-2 w-4 h-4 bg-emerald-400 border-2 border-black rounded-sm cursor-nwse-resize shadow"
                onMouseDown={(e) => handleMouseDown("br", e)}
                onTouchStart={(e) => handleMouseDown("br", e)}
              />
            </div>
          </div>
        </div>

        {/* Footer with Presets & Action Buttons */}
        <div className="p-3 sm:p-4 bg-neutral-950 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-400">
            <span className="hidden sm:inline mr-1">Presets:</span>
            <button
              onClick={() => handleSetAspect("free")}
              className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white"
            >
              Full
            </button>
            <button
              onClick={() => handleSetAspect("document")}
              className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white"
            >
              Document (A4)
            </button>
            <button
              onClick={() => handleSetAspect("landscape")}
              className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white"
            >
              Landscape
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={skipCropAndSave}
              className="px-3 py-1.5 rounded text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition"
              title="Proceed without cropping"
            >
              Skip Crop
            </button>

            <button
              onClick={applyCropAndSave}
              className="px-4 py-1.5 rounded text-xs font-semibold text-black bg-emerald-400 hover:bg-emerald-300 transition shadow-sm flex items-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Apply Crop & Scan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
