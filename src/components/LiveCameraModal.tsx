"use client";

import React, { useRef, useState, useEffect } from "react";
import { Camera, X, RefreshCw, Zap, ZapOff, AlertCircle } from "lucide-react";

interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string) => void;
  docTitle?: string;
}

export default function LiveCameraModal({
  isOpen,
  onClose,
  onCapture,
  docTitle = "Document",
}: LiveCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stop camera tracks
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start camera stream
  const startCamera = async (mode: "environment" | "user") => {
    stopStream();
    setIsLoading(true);
    setErrorMsg(null);
    setTorchOn(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API is not supported on this browser/device.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = (track.getCapabilities && (track.getCapabilities() as any)) || {};
      setHasTorch(Boolean(capabilities.torch));
      setIsLoading(false);
    } catch (err: any) {
      console.error("[LiveCamera Error]:", err);
      // Fallback: If environment camera failed, try generic user camera
      if (mode === "environment") {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            await videoRef.current.play();
          }
          setIsLoading(false);
          return;
        } catch {
          // ignore fallback error
        }
      }
      setErrorMsg(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Camera permission denied. Please allow camera access in your browser settings."
          : err.message || "Failed to initialize camera."
      );
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  // Toggle Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextTorch = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextTorch }],
        });
        setTorchOn(nextTorch);
      } catch (err) {
        console.warn("Failed to toggle torch:", err);
      }
    }
  };

  // Flip Camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // Capture Snapshot
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    let width = video.videoWidth || 1920;
    let height = video.videoHeight || 1080;
    const MAX_DIM = 1800;

    if (width > MAX_DIM || height > MAX_DIM) {
      if (width > height) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      } else {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg", 0.86);
    stopStream();
    onCapture(base64);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-2 sm:p-4">
      <div className="relative w-full max-w-2xl bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-neutral-800 flex items-center justify-between bg-black/60">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-emerald-400" />
            <span className="font-semibold text-xs sm:text-sm text-white">
              Scan {docTitle}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                onClick={toggleTorch}
                className={`p-2 rounded-full border transition ${
                  torchOn
                    ? "bg-amber-500 text-black border-amber-400"
                    : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:text-white"
                }`}
                title={torchOn ? "Turn Torch Off" : "Turn Torch On"}
              >
                {torchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
              </button>
            )}

            <button
              onClick={toggleFacingMode}
              className="p-2 rounded-full bg-neutral-900 text-neutral-300 border border-neutral-700 hover:text-white transition"
              title="Switch Camera (Front / Back)"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <button
              onClick={() => {
                stopStream();
                onClose();
              }}
              className="p-2 rounded-full bg-neutral-900 text-neutral-300 border border-neutral-700 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Viewfinder Viewport */}
        <div className="relative flex-1 min-h-[320px] sm:min-h-[440px] bg-black flex items-center justify-center overflow-hidden">
          {errorMsg ? (
            <div className="p-6 text-center max-w-sm">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <div className="font-semibold text-sm text-red-300">Camera Unavailable</div>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">{errorMsg}</p>
              <button
                onClick={() => startCamera(facingMode)}
                className="mt-4 px-4 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-xs font-mono text-white border border-neutral-700 transition"
              >
                Retry Camera
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="w-full h-full object-cover"
              />

              {isLoading && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-6 w-6 text-emerald-400 animate-spin" />
                  <span className="text-xs font-mono text-neutral-400">Starting camera...</span>
                </div>
              )}

              {/* Document Alignment Frame Overlay */}
              {!isLoading && (
                <div className="pointer-events-none absolute inset-6 sm:inset-10 border-2 border-emerald-400/70 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                  {/* Framing Corner Markers */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl"></div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr"></div>
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl"></div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br"></div>

                  {/* Laser Scan line effect */}
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse opacity-70"></div>

                  <div className="absolute bottom-3 inset-x-0 text-center">
                    <span className="px-3 py-1 rounded-full bg-black/80 border border-neutral-700 text-[11px] font-mono text-emerald-300">
                      Align {docTitle} inside frame
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Shutter Button Footer */}
        <div className="p-4 bg-black/90 border-t border-neutral-800 flex items-center justify-center gap-4">
          <button
            onClick={capturePhoto}
            disabled={isLoading || Boolean(errorMsg)}
            className="group relative flex items-center justify-center h-16 w-16 rounded-full bg-white hover:bg-neutral-200 transition disabled:opacity-30 shadow-lg"
            title="Take Photo"
          >
            <div className="h-13 w-13 rounded-full border-2 border-black group-hover:scale-95 transition-transform flex items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-black"></div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
