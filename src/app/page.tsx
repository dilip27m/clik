"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Database,
  Search,
  Trash2,
  RefreshCw,
  Eye,
  Truck,
  Building2,
  ChevronDown,
  Cloud,
  FileText,
  Plus,
  X,
  Send,
  ArrowRight,
  ArrowLeft,
  Receipt,
  Filter,
  Calendar,
  Layers,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  Pencil,
  Crop,
  RotateCw,
  ScanSearch,
} from "lucide-react";
import {
  TransitRecord,
  InvoiceRecord,
  DocumentTypeOption,
  MINERAL_GRADE_OPTIONS,
  GoogleDriveSyncConfig,
  MasterLogFilters,
  TRANSIT_FIELD_METADATA,
} from "@/types/transit";
import { GOOGLE_APPS_SCRIPT_CODE } from "@/lib/googledrive";
import LiveCameraModal from "@/components/LiveCameraModal";
import ImageCropperModal from "@/components/ImageCropperModal";
import { optimizeImageForOcr } from "@/lib/imageOptimizer";

export default function Home() {
  // Navigation: null = Home Page (3 Options); or active document type
  const [selectedDocType, setSelectedDocType] = useState<DocumentTypeOption | null>(null);

  // Active sub-tab inside a document workspace: "scan" | "records"
  const [activeTab, setActiveTab] = useState<"scan" | "records">("scan");

  // Records state
  const [transitRecords, setTransitRecords] = useState<TransitRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [overallStats, setOverallStats] = useState<{
    totalTransitRecords: number;
    duplicateCount: number;
    originalCount: number;
    invoiceCount: number;
    totalQtyMt: number;
    uniqueVehicles: number;
    isPostgres: boolean;
    dbError?: string | null;
  }>({
    totalTransitRecords: 0,
    duplicateCount: 0,
    originalCount: 0,
    invoiceCount: 0,
    totalQtyMt: 0,
    uniqueVehicles: 0,
    isPostgres: true,
    dbError: null,
  });
  const [isRetryingDb, setIsRetryingDb] = useState(false);
  const [dbRetryStatus, setDbRetryStatus] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Filter Bar state
  const [filters, setFilters] = useState<MasterLogFilters>({
    search: "",
    month: "",
    startDate: "",
    endDate: "",
    company: "",
    grade: "",
  });

  // Scanning & Extraction state
  const [isProcessing, setIsProcessing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentTransitRecord, setCurrentTransitRecord] = useState<TransitRecord | null>(null);
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceRecord | null>(null);
  const [extractionMeta, setExtractionMeta] = useState<{
    source?: string;
  } | null>(null);
  const [wrongDocAlert, setWrongDocAlert] = useState<string | null>(null);
  const [validationReport, setValidationReport] = useState<{
    isValid: boolean;
    warnings: string[];
    fieldErrors: Record<string, string>;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    type: "success" | "error" | "duplicate" | null;
    message: string;
    googleDriveSynced?: boolean;
  }>({ type: null, message: "" });

  // Google Sheets link & configuration
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("AP_MINES_GOOGLE_SHEET_URL");
      if (saved) return saved;
    }
    return (
      process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL ||
      "https://docs.google.com/spreadsheets/d/1wlJysYfR4fTKCjvp0aFvdOooqYyvUtuXgTACneiO49U/edit?gid=0#gid=0"
    );
  });
  const [showSettings, setShowSettings] = useState(false);
  const [driveConfig, setDriveConfig] = useState<GoogleDriveSyncConfig>(() => {
    if (typeof window === "undefined") return { enabled: false, webhookUrl: "" };
    const savedDrive = localStorage.getItem("TRANSIT_GOOGLE_DRIVE_SYNC");
    if (savedDrive) {
      try {
        return JSON.parse(savedDrive);
      } catch (e) {
        console.error("Failed to parse drive config:", e);
      }
    }
    return { enabled: false, webhookUrl: "" };
  });
  const [driveTesting, setDriveTesting] = useState(false);
  const [driveTestMsg, setDriveTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Modals
  const [detailTransitRecord, setDetailTransitRecord] = useState<TransitRecord | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<InvoiceRecord | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);

  // Editing state
  const [editingTransitRecord, setEditingTransitRecord] = useState<TransitRecord | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Live Camera & Image Cropper state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showCropperModal, setShowCropperModal] = useState(false);
  const [rawCropImage, setRawCropImage] = useState<string | null>(null);

  // Universal scanner: detected type after AI classification
  const [detectedUniversalType, setDetectedUniversalType] = useState<{
    type: "transit_duplicate" | "transit_original" | "invoice" | "unknown";
    confidence: number;
    reason: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);


  const viewImageInNewTab = (src: string | null) => {
    if (!src) return;
    const w = window.open("");
    w?.document.write(`<html><head><title>Document Preview</title></head><body style="margin:0;background:#0a0a0a;display:flex;justify-content:center;align-items:center;min-height:100vh;"><img src="${src}" style="max-width:96%;max-height:96vh;object-fit:contain;box-shadow:0 0 30px rgba(0,0,0,0.8);" /></body></html>`);
  };

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (filters.search) params.append("search", filters.search);
    if (filters.month) params.append("month", filters.month);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    if (filters.company) params.append("company", filters.company);
    if (filters.grade) params.append("grade", filters.grade);
    return params.toString();
  };

  const loadActiveData = async () => {
    setLoadingData(true);
    try {
      const query = buildQueryString();
      if (selectedDocType === "invoice") {
        const res = await fetch(`/api/invoices${query ? `?${query}` : ""}`);
        const data = await res.json();
        if (data.success) setInvoices(data.invoices || []);
      } else {
        const docParam = selectedDocType ? `docType=${selectedDocType}` : "";
        const fullQuery = [docParam, query].filter(Boolean).join("&");
        const res = await fetch(`/api/records${fullQuery ? `?${fullQuery}` : ""}`);
        const data = await res.json();
        if (data.success) {
          setTransitRecords(data.records || []);
          if (data.stats) setOverallStats(data.stats);
        }
      }

      // Always update overall stats
      const statsRes = await fetch("/api/records?stats=true");
      const statsData = await statsRes.json();
      if (statsData.success && statsData.stats) {
        setOverallStats(statsData.stats);
      }
    } catch (err) {
      console.error("Data load error:", err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleRetryConnection = async () => {
    setIsRetryingDb(true);
    setDbRetryStatus("Testing connection to PostgreSQL / Neon database...");
    try {
      const statsRes = await fetch("/api/records?stats=true");
      const statsData = await statsRes.json();
      if (statsData.success && statsData.stats) {
        setOverallStats(statsData.stats);
        if (statsData.stats.isPostgres) {
          setDbRetryStatus("Connected successfully! Reloading data...");
          await loadActiveData();
          setTimeout(() => setDbRetryStatus(null), 4000);
        } else {
          const detail =
            statsData.stats.dbError ||
            "PostgreSQL / Neon is unreachable. If deployed on Vercel, check DATABASE_URL in Settings and trigger a Redeploy.";
          setDbRetryStatus(`Connection failed: ${detail}`);
        }
      } else {
        setDbRetryStatus("Unable to reach backend API. Please refresh the page.");
      }
    } catch (err: any) {
      setDbRetryStatus(`Error testing connection: ${err.message || "Network failure"}`);
    } finally {
      setIsRetryingDb(false);
    }
  };

  // On mount & when docType/filters change
  useEffect(() => {
    loadActiveData();
  }, [selectedDocType, filters]);

  const saveDriveConfigToStorage = (config: GoogleDriveSyncConfig) => {
    setDriveConfig(config);
    localStorage.setItem("TRANSIT_GOOGLE_DRIVE_SYNC", JSON.stringify(config));
  };

  const testGoogleDriveConnection = async () => {
    if (!driveConfig.webhookUrl) return;
    setDriveTesting(true);
    setDriveTestMsg(null);
    try {
      const res = await fetch("/api/sync/googledrive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: driveConfig, testOnly: true }),
      });
      const data = await res.json();
      setDriveTestMsg({
        ok: data.success,
        text: data.message || (data.success ? "Connection Successful!" : "Failed"),
      });
    } catch (err: any) {
      setDriveTestMsg({ ok: false, text: err.message || "Failed to reach Google Drive" });
    } finally {
      setDriveTesting(false);
    }
  };

  // Image Upload & Extraction Pipeline
  const handleImageFile = async (file: File) => {
    setWrongDocAlert(null);
    try {
      const optimizedBase64 = await optimizeImageForOcr(file, { maxDimension: 1800, quality: 0.86 });
      setRawCropImage(optimizedBase64);
      setShowCropperModal(true);
    } catch {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        setRawCropImage(base64);
        setShowCropperModal(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = async (capturedBase64: string) => {
    setShowCameraModal(false);
    try {
      const optimized = await optimizeImageForOcr(capturedBase64, { maxDimension: 1800, quality: 0.86 });
      setRawCropImage(optimized);
    } catch {
      setRawCropImage(capturedBase64);
    }
    setShowCropperModal(true);
  };

  const handleCropperComplete = (processedBase64: string) => {
    setShowCropperModal(false);
    setImagePreview(processedBase64);
    processImageExtraction(processedBase64);
  };

  const handleReCrop = () => {
    if (imagePreview) {
      setRawCropImage(imagePreview);
      setShowCropperModal(true);
    }
  };

  const processImageExtraction = async (base64: string, mimeType: string = "image/jpeg") => {
    setIsProcessing(true);
    setWrongDocAlert(null);
    setSaveStatus({ type: null, message: "" });
    setCurrentTransitRecord(null);
    setCurrentInvoice(null);
    setDetectedUniversalType(null);

    try {
      // Ensure image is safe size (< 1.5MB base64) to avoid Vercel 4.5MB payload limits
      let uploadBase64 = base64;
      if (base64.length > 1.5 * 1024 * 1024) {
        try {
          uploadBase64 = await optimizeImageForOcr(base64, { maxDimension: 1600, quality: 0.84 });
        } catch (optErr) {
          console.warn("Safety compression skipped:", optErr);
        }
      }

      // Universal mode: use the classify-then-extract endpoint
      if (selectedDocType === "universal") {
        const res = await fetch("/api/extract/universal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64: uploadBase64, mimeType }),
        });

        let data: any;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const rawText = await res.text();
          if (res.status === 413) {
            throw new Error("The image exceeds the server size limit. Please crop or choose a smaller photo.");
          }
          if (res.status === 504 || res.status === 408) {
            throw new Error("AI extraction timed out. Please try again with a clearer or cropped image.");
          }
          throw new Error(
            `Server returned status ${res.status}: ${rawText.slice(0, 100) || res.statusText || "Extraction failed"}`
          );
        }

        if (res.status === 422 || data.isWrongDocument) {
          setDetectedUniversalType(data.classification || { type: "unknown", confidence: 0, reason: data.error || "" });
          setWrongDocAlert(
            data.error ||
              "Unable to identify this document. Please upload a recognized AP Mines form."
          );
          return;
        }

        if (data.success) {
          // Set the detected type for the badge
          setDetectedUniversalType({
            type: data.detectedType,
            confidence: data.classification?.confidence ?? 95,
            reason: data.classification?.reason || "",
          });

          if (data.isInvoice) {
            setCurrentInvoice({ ...data.data, imageUrl: uploadBase64 });
          } else {
            setCurrentTransitRecord({
              ...data.data,
              docType: data.detectedType,
              imageUrl: uploadBase64,
            });
            setValidationReport(data.validation);
          }
          setExtractionMeta({ source: data.source });
        } else {
          setWrongDocAlert(data.error || "Extraction failed. Please verify the image quality.");
        }
        return;
      }

      // Standard mode: use the specific extractor
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base64: uploadBase64,
          mimeType,
          docType: selectedDocType || "transit_duplicate",
        }),
      });

      let data: any;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        if (res.status === 413) {
          throw new Error("The image exceeds the server size limit. Please crop or choose a smaller photo.");
        }
        if (res.status === 504 || res.status === 408) {
          throw new Error("AI extraction timed out. Please try again with a clearer or cropped image.");
        }
        throw new Error(
          `Server returned status ${res.status}: ${rawText.slice(0, 100) || res.statusText || "Extraction failed"}`
        );
      }

      if (res.status === 422 || data.isWrongDocument) {
        setWrongDocAlert(
          data.error ||
            `Wrong Document Uploaded: This image does not match the ${getDocTitle(selectedDocType)} format. Please check and re-upload.`
        );
        return;
      }

      if (data.success) {
        if (data.isInvoice || selectedDocType === "invoice") {
          setCurrentInvoice({ ...data.data, imageUrl: uploadBase64 });
        } else {
          setCurrentTransitRecord({
            ...data.data,
            docType: selectedDocType || "transit_duplicate",
            imageUrl: uploadBase64,
          });
          setValidationReport(data.validation);
        }
        setExtractionMeta({ source: data.source });
      } else {
        setWrongDocAlert(data.error || "Extraction failed. Please verify the image quality.");
      }
    } catch (err: any) {
      setWrongDocAlert(err.message || "Failed to reach extraction service.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Field change handlers
  const handleTransitFieldChange = (key: keyof TransitRecord, value: any) => {
    if (!currentTransitRecord) return;
    setCurrentTransitRecord({ ...currentTransitRecord, [key]: value });
  };

  const handleInvoiceFieldChange = (key: keyof InvoiceRecord, value: any) => {
    if (!currentInvoice) return;
    setCurrentInvoice({ ...currentInvoice, [key]: value });
  };

  // Save Record
  const handleSaveCurrentRecord = async () => {
    setSaveStatus({ type: null, message: "" });

    // Determine the effective docType for saving (universal uses detected type)
    const effectiveDocType = selectedDocType === "universal"
      ? (detectedUniversalType?.type || "transit_duplicate")
      : selectedDocType;

    // 1. Save Invoice
    if ((effectiveDocType === "invoice" || selectedDocType === "invoice") && currentInvoice) {
      try {
        const res = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentInvoice),
        });
        const data = await res.json();

        if (res.status === 409 || data.isDuplicate) {
          setSaveStatus({
            type: "duplicate",
            message: `Invoice No '${currentInvoice.invoiceNo}' already exists in database. Duplicate prevented!`,
          });
          return;
        }

        if (data.success) {
          let driveSynced = false;
          if (driveConfig.enabled && driveConfig.webhookUrl) {
            try {
              const driveRes = await fetch("/api/sync/googledrive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  invoice: currentInvoice,
                  docType: "invoice",
                  config: driveConfig,
                }),
              });
              const driveData = await driveRes.json();
              driveSynced = driveData.success;
            } catch (e) {
              console.warn("Google Drive invoice sync failed:", e);
            }
          }

          setSaveStatus({
            type: "success",
            message: `Tax Invoice ${currentInvoice.invoiceNo} saved successfully!${selectedDocType === "universal" ? " (Auto-detected)" : ""}`,
            googleDriveSynced: driveSynced,
          });
          loadActiveData();
        } else {
          setSaveStatus({ type: "error", message: data.error || "Failed to save invoice." });
        }
      } catch (err: any) {
        setSaveStatus({ type: "error", message: err.message || "Network error while saving." });
      }
      return;
    }

    // 2. Save Transit Form
    if (currentTransitRecord) {
      const transitDocType = selectedDocType === "universal"
        ? (detectedUniversalType?.type || "transit_duplicate")
        : (selectedDocType || "transit_duplicate");

      try {
        const res = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...currentTransitRecord,
            docType: transitDocType,
          }),
        });
        const data = await res.json();

        if (res.status === 409 || data.isDuplicate) {
          setSaveStatus({
            type: "duplicate",
            message: `Stationary No '${currentTransitRecord.stationaryNo}' already exists in database. Duplicate prevented!`,
          });
          return;
        }

        if (data.success) {
          let driveSynced = false;
          if (driveConfig.enabled && driveConfig.webhookUrl) {
            try {
              const driveRes = await fetch("/api/sync/googledrive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  record: currentTransitRecord,
                  docType: transitDocType,
                  config: driveConfig,
                }),
              });
              const driveData = await driveRes.json();
              driveSynced = driveData.success;
            } catch (e) {
              console.warn("Drive sync failed:", e);
            }
          }

          const typeLabel = getDocTitle(transitDocType as DocumentTypeOption);
          setSaveStatus({
            type: "success",
            message: `${typeLabel} ${currentTransitRecord.stationaryNo} saved successfully!${selectedDocType === "universal" ? " (Auto-detected)" : ""}`,
            googleDriveSynced: driveSynced,
          });
          loadActiveData();
        } else {
          setSaveStatus({ type: "error", message: data.error || "Failed to save record." });
        }
      } catch (err: any) {
        setSaveStatus({ type: "error", message: err.message || "Network error while saving." });
      }
    }
  };

  // Delete
  const handleDeleteTransit = async (stationaryNo: string) => {
    if (!confirm(`Delete record: ${stationaryNo}?`)) return;
    try {
      const docParam = selectedDocType ? `?docType=${selectedDocType}` : "";
      const res = await fetch(`/api/records/${encodeURIComponent(stationaryNo)}${docParam}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to delete record.");
        return;
      }
      loadActiveData();
      if (detailTransitRecord?.stationaryNo === stationaryNo) setDetailTransitRecord(null);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Network error while deleting record.");
    }
  };

  const handleDeleteInvoice = async (invoiceNo: string) => {
    if (!confirm(`Delete Tax Invoice: ${invoiceNo}?`)) return;
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to delete invoice.");
        return;
      }
      loadActiveData();
      if (detailInvoice?.invoiceNo === invoiceNo) setDetailInvoice(null);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Network error while deleting invoice.");
    }
  };

  // Edit handlers
  const handleStartEditTransit = (record: TransitRecord) => {
    setEditingTransitRecord({ ...record });
  };

  const handleStartEditInvoice = (invoice: InvoiceRecord) => {
    setEditingInvoice({ ...invoice });
  };

  const handleSaveEditTransit = async () => {
    if (!editingTransitRecord) return;
    setEditSaving(true);
    try {
      const docParam = editingTransitRecord.docType || selectedDocType || "transit_duplicate";
      const res = await fetch(
        `/api/records/${encodeURIComponent(editingTransitRecord.stationaryNo)}?docType=${docParam}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...editingTransitRecord, docType: docParam }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setEditingTransitRecord(null);
        setDetailTransitRecord(data.record || null);
        loadActiveData();
      } else {
        alert(data.error || "Failed to update record");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleSaveEditInvoice = async () => {
    if (!editingInvoice) return;
    setEditSaving(true);
    try {
      const res = await fetch(
        `/api/invoices/${encodeURIComponent(editingInvoice.invoiceNo)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingInvoice),
        }
      );
      const data = await res.json();
      if (data.success) {
        setEditingInvoice(null);
        setDetailInvoice(data.invoice || null);
        loadActiveData();
      } else {
        alert(data.error || "Failed to update invoice");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    } finally {
      setEditSaving(false);
    }
  };

  function getDocTitle(docType: DocumentTypeOption | null): string {
    switch (docType) {
      case "transit_duplicate":
        return "Transit Pass (Duplicate)";
      case "transit_original":
        return "Transit Pass (Original)";
      case "invoice":
        return "Tax Invoice";
      case "universal":
        return "Universal Scanner";
      default:
        return "Department Form";
    }
  }

  const resetFilters = () => {
    setFilters({ search: "", month: "", startDate: "", endDate: "", company: "", grade: "" });
  };

  const hasActiveFilters = Boolean(
    filters.search || filters.month || filters.startDate || filters.endDate || filters.company || filters.grade
  );

  return (
    <div className="min-h-screen bg-[#050505] text-[#ededed] font-sans antialiased flex flex-col selection:bg-neutral-800 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-[#1f1f1f] bg-[#050505]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img
              src="/logo.svg"
              alt="AP Mines Portal"
              className="h-6 w-6 sm:h-7 sm:w-7 rounded object-contain shadow-sm shrink-0"
            />
            <div className="flex items-baseline gap-1.5 sm:gap-2 truncate">
              <span className="font-semibold text-xs sm:text-sm tracking-tight text-white font-mono truncate">
                AP MINES
              </span>
              <span className="hidden md:inline-block text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                // OCR & Master Ledger
              </span>
            </div>
            {overallStats.isPostgres ? (
              <div className="flex items-center ml-1 sm:ml-2 px-2 py-0.5 rounded-full border border-emerald-900/60 bg-emerald-950/30 text-[9px] sm:text-[10px] font-mono text-emerald-300 gap-1 shrink-0" title="Connected to PostgreSQL / Neon Database">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                <span><span className="hidden sm:inline">POSTGRES </span>CONNECTED</span>
              </div>
            ) : (
              <div className="flex items-center ml-1 sm:ml-2 px-2 py-0.5 rounded-full border border-red-800 bg-red-950/60 text-[9px] sm:text-[10px] font-mono text-red-300 gap-1 shrink-0 animate-pulse" title="PostgreSQL Database is Offline! Saving disabled to prevent data loss.">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                <span>OFFLINE</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Direct Google Sheets Link */}
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white text-xs px-2 sm:px-2.5 py-1.5 rounded-md border border-neutral-800 transition"
              title="Open Google Sheets in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">Google Sheets</span>
              <span className="sm:hidden">Sheets</span>
            </a>

            {/* Always visible: Master Combined Export (All 3 Forms in 3 Tabs) */}
            <a
              href="/api/export?docType=master"
              download
              className="flex items-center gap-1 sm:gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs px-2.5 sm:px-3 py-1.5 rounded-md font-semibold transition shadow-sm whitespace-nowrap"
              title="Download Combined Master Excel containing all 3 forms in separate tabs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Excel</span>
              <span className="hidden sm:inline">Master Excel</span>
              <span className="hidden md:inline text-[10px] opacity-80">(3 Tabs)</span>
            </a>

            {/* When inside a specific form: Option to export just this form */}
            {selectedDocType && (
              <a
                href={`/api/export?docType=${selectedDocType}&${buildQueryString()}`}
                download
                className="flex items-center gap-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-700 text-xs px-2 sm:px-2.5 py-1.5 rounded-md font-medium transition shadow-sm whitespace-nowrap"
                title={`Export ${getDocTitle(selectedDocType)} records only`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <span className="hidden sm:inline">This Form</span>
                <span>.xlsx</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Database Offline Warning Banner */}
      {!overallStats.isPostgres && (
        <div className="bg-red-950/95 border-b border-red-800/80 text-red-200 px-3 sm:px-6 py-3 text-xs font-mono shadow-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5 sm:mt-0" />
              <div className="space-y-0.5 min-w-0">
                <div className="font-semibold text-red-200">
                  Database Offline: PostgreSQL / Neon is currently unreachable.
                </div>
                {dbRetryStatus ? (
                  <div className={`text-[11px] font-sans break-words ${dbRetryStatus.includes("successfully") ? "text-emerald-300 font-semibold" : "text-amber-300 font-medium"}`}>
                    {dbRetryStatus}
                  </div>
                ) : overallStats.dbError ? (
                  <div className="text-[11px] font-sans text-amber-300/90 break-words">
                    Status: {overallStats.dbError}
                  </div>
                ) : (
                  <div className="text-[11px] font-sans text-red-300/80">
                    Record saving is temporarily disabled to prevent data loss.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 pt-1 sm:pt-0">
              <button
                type="button"
                disabled={isRetryingDb}
                onClick={handleRetryConnection}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-900 hover:bg-red-800 active:bg-red-950 text-white text-[11px] font-mono transition shadow-sm disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 shrink-0 ${isRetryingDb ? "animate-spin text-amber-300" : ""}`} />
                <span>{isRetryingDb ? "Connecting to Neon..." : "Retry Connection"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 1: HOME PAGE (ONLY 3 OPTIONS AS REQUESTED BY USER) */}
      {selectedDocType === null ? (
        <main className="flex-1 max-w-5xl w-full mx-auto px-3.5 sm:px-6 py-6 sm:py-12 flex flex-col justify-center">
          <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-10">
            <div className="flex justify-center mb-3 sm:mb-4">
              <img
                src="/logo.svg"
                alt="AP Mines Portal Logo"
                className="h-12 w-12 sm:h-16 sm:w-16 drop-shadow-[0_4px_16px_rgba(16,185,129,0.3)] animate-pulse"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full border border-neutral-800 bg-[#0d0d0d] text-[11px] sm:text-xs font-mono text-neutral-400 mb-3 sm:mb-4">
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-400 shrink-0"></span>
              Andhra Pradesh Dept of Mines & Geology
            </div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-white">
              Document Workflow Selection
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-2 leading-relaxed px-2">
              Select one of the 3 official documents below. Each option opens a dedicated upload scanner with live camera and crop tools, and an isolated Master Log with custom filter tools.
            </p>
          </div>

          {/* THE 4 OPTIONS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {/* OPTION 0: Universal Scanner — spans full width on desktop */}
            <div
              onClick={() => {
                setSelectedDocType("universal");
                setActiveTab("scan");
                setCurrentTransitRecord(null);
                setCurrentInvoice(null);
                setImagePreview(null);
                setDetectedUniversalType(null);
                resetFilters();
              }}
              className="md:col-span-2 p-5 sm:p-6 rounded-xl border border-violet-800/60 bg-gradient-to-br from-[#0d0a14] to-[#0a0a0a] hover:border-violet-500 transition-all cursor-pointer group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl relative overflow-hidden"
            >
              {/* Subtle gradient glow */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-violet-600/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-start sm:items-center gap-4 min-w-0">
                <div className="h-11 w-11 rounded-lg bg-violet-950 border border-violet-700/60 flex items-center justify-center text-violet-300 group-hover:bg-violet-600 group-hover:text-white transition shrink-0">
                  <ScanSearch className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base text-white tracking-tight">
                      Universal Scanner
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-950/80 border border-violet-700/60 text-violet-300 font-semibold uppercase">
                      AI Auto-Detect
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                    Upload any document — AI will automatically detect whether it&apos;s a Transit Duplicate, Transit Original, or Tax Invoice, then extract and save to the correct form.
                  </p>
                </div>
              </div>

              <span className="text-white group-hover:translate-x-1 transition-transform flex items-center gap-1.5 font-semibold text-xs font-mono whitespace-nowrap shrink-0">
                Smart Upload <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>

            {/* OPTION 1: Transit Pass (Duplicate) */}
            <div
              onClick={() => {
                setSelectedDocType("transit_duplicate");
                setActiveTab("scan");
                setCurrentTransitRecord(null);
                setCurrentInvoice(null);
                setImagePreview(null);
                resetFilters();
              }}
              className="p-5 sm:p-6 rounded-xl border border-neutral-800 bg-[#0a0a0a] hover:border-white transition-all cursor-pointer group flex flex-col justify-between shadow-xl relative overflow-hidden"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white group-hover:bg-white group-hover:text-black transition">
                    <FileText className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 border border-emerald-800 text-emerald-400 font-semibold uppercase">
                    Active
                  </span>
                </div>
                <h3 className="font-semibold text-base text-white tracking-tight">
                  Transit Pass (Duplicate)
                </h3>
                <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                  Inbound Department Transit Form. Extracts 6 core fields: Stationary No (PK), Date, Consignee, Mineral Grade (A, B, C & D), Vehicle, and Dispatch Qty.
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-neutral-900 flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-500">
                  {overallStats.duplicateCount} Records in Log
                </span>
                <span className="text-white group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold">
                  Upload & Ledger <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>

            {/* OPTION 2: Transit Pass (Original) */}
            <div
              onClick={() => {
                setSelectedDocType("transit_original");
                setActiveTab("scan");
                setCurrentTransitRecord(null);
                setCurrentInvoice(null);
                setImagePreview(null);
                resetFilters();
              }}
              className="p-5 sm:p-6 rounded-xl border border-neutral-800 bg-[#0a0a0a] hover:border-white transition-all cursor-pointer group flex flex-col justify-between shadow-xl relative overflow-hidden"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white group-hover:bg-white group-hover:text-black transition">
                    <Truck className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 border border-emerald-800 text-emerald-400 font-semibold uppercase">
                    Active
                  </span>
                </div>
                <h3 className="font-semibold text-base text-white tracking-tight">
                  Transit Pass (Original)
                </h3>
                <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                  Government Form E - Transit Pass (Original). Extracts Stationary No (PK), Date, Consignee, Mineral Grade, Vehicle No, and Production Qty.
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-neutral-900 flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-500">
                  {overallStats.originalCount} Records in Log
                </span>
                <span className="text-white group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold">
                  Upload & Ledger <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>

            {/* OPTION 3: Tax Invoice */}
            <div
              onClick={() => {
                setSelectedDocType("invoice");
                setActiveTab("scan");
                setCurrentTransitRecord(null);
                setCurrentInvoice(null);
                setImagePreview(null);
                resetFilters();
              }}
              className="md:col-span-2 p-5 sm:p-6 rounded-xl border border-neutral-800 bg-[#0a0a0a] hover:border-white transition-all cursor-pointer group flex flex-col justify-between shadow-xl relative overflow-hidden"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white group-hover:bg-white group-hover:text-black transition">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 border border-emerald-800 text-emerald-400 font-semibold uppercase">
                    Active
                  </span>
                </div>
                <h3 className="font-semibold text-base text-white tracking-tight">
                  Tax Invoice
                </h3>
                <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                  Commercial Tax Invoice. Extracts the strict 9 marked fields: Invoice No (PK), Date, Bill To, Quantity, Rate, Taxable Amt, CGST, SGST, Total.
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-neutral-900 flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-500">
                  {overallStats.invoiceCount} Records in Log
                </span>
                <span className="text-white group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold">
                  Upload & Ledger <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* VIEW 2: DEDICATED DOCUMENT WORKSPACE */
        <div className="flex-1 flex flex-col">
          {/* Top Bar with Back Arrow and Tabs */}
          <div className="border-b border-[#18181b] bg-[#0a0a0a]">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  onClick={() => { setSelectedDocType(null); setDetectedUniversalType(null); }}
                  className="px-2 sm:px-2.5 py-1 text-xs font-mono text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 rounded border border-neutral-800 transition flex items-center gap-1 sm:gap-1.5 shrink-0"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">All Forms</span>
                  <span className="sm:hidden">Back</span>
                </button>
                <div className="h-4 w-px bg-neutral-800 shrink-0"></div>
                <span className="font-semibold text-xs sm:text-sm text-white truncate">
                  {getDocTitle(selectedDocType)}
                </span>
                {/* Universal detection badge */}
                {selectedDocType === "universal" && detectedUniversalType && detectedUniversalType.type !== "unknown" && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-violet-700/60 bg-violet-950/40 text-[9px] sm:text-[10px] font-mono text-violet-300 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse"></span>
                    <span>Detected: {getDocTitle(detectedUniversalType.type as DocumentTypeOption)}</span>
                    <span className="text-violet-500">({detectedUniversalType.confidence}%)</span>
                  </div>
                )}
              </div>

              {/* Sub-tabs: hide "Master Log" for universal since it doesn't have its own */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab("scan")}
                  className={`px-2.5 sm:px-3.5 py-1.5 text-xs font-medium rounded transition flex items-center gap-1.5 ${
                    activeTab === "scan"
                      ? "bg-white text-black font-semibold shadow-sm"
                      : "text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800"
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Upload Image & Verify</span>
                  <span className="sm:hidden">Upload</span>
                </button>
                {selectedDocType !== "universal" && (
                  <button
                    onClick={() => setActiveTab("records")}
                    className={`px-2.5 sm:px-3.5 py-1.5 text-xs font-medium rounded transition flex items-center gap-1.5 ${
                      activeTab === "records"
                        ? "bg-white text-black font-semibold shadow-sm"
                        : "text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800"
                    }`}
                  >
                    <Database className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Master Log (</span>
                    <span className="sm:hidden">(</span>
                    {selectedDocType === "invoice" ? invoices.length : transitRecords.length}
                    )
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Workspace Body */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
            {activeTab === "scan" ? (
              <div className="space-y-6">

                {/* Wrong Document Alert */}
                {wrongDocAlert && (
                  <div className="p-4 rounded-xl border border-red-800/80 bg-red-950/40 text-red-200 text-xs flex items-start gap-3 shadow-lg">
                    <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-red-300">
                        Document Validation Warning
                      </div>
                      <p className="mt-1 leading-relaxed text-red-200/90">{wrongDocAlert}</p>
                      <button
                        onClick={() => setWrongDocAlert(null)}
                        className="mt-3 text-xs bg-red-900/60 hover:bg-red-800 text-white px-3 py-1 rounded border border-red-700 font-medium transition"
                      >
                        Try Another Photo
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload Image Section */}
                {!currentTransitRecord && !currentInvoice && (
                  <div className={`border border-dashed rounded-xl p-6 sm:p-14 text-center relative overflow-hidden transition ${selectedDocType === "universal" ? "border-violet-800/60 bg-gradient-to-br from-[#0d0a14] to-[#09090b] hover:border-violet-600" : "border-neutral-800 bg-[#09090b] hover:border-neutral-700"}`}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFile(file);
                      }}
                    />
                    <input
                      type="file"
                      ref={cameraInputRef}
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFile(file);
                      }}
                    />

                    <div className="max-w-md mx-auto flex flex-col items-center">
                      <div className={`h-14 w-14 rounded-full border flex items-center justify-center text-white mb-4 shadow-sm ${selectedDocType === "universal" ? "bg-violet-950 border-violet-700/60" : "bg-neutral-900 border-neutral-800"}`}>
                        {isProcessing ? (
                          <RefreshCw className={`h-6 w-6 animate-spin ${selectedDocType === "universal" ? "text-violet-400" : "text-neutral-400"}`} />
                        ) : selectedDocType === "universal" ? (
                          <ScanSearch className="h-6 w-6 text-violet-300" />
                        ) : (
                          <Upload className="h-6 w-6 text-neutral-300" />
                        )}
                      </div>

                      <h3 className="text-base font-semibold text-white tracking-tight">
                        {isProcessing
                          ? (selectedDocType === "universal" ? "AI is Classifying & Extracting..." : "Extracting Document Fields...")
                          : selectedDocType === "universal" ? "Upload Any Document" : `Upload Image for ${getDocTitle(selectedDocType)}`}
                      </h3>
                      <p className="text-xs text-neutral-400 mt-1.5 max-w-sm">
                        {isProcessing
                          ? (selectedDocType === "universal" ? "AI is identifying the document type and extracting fields automatically..." : "Vision model is reading key fields and validating document layout...")
                          : selectedDocType === "universal" ? "Upload any Transit Form or Invoice — AI will detect the type and extract automatically." : "Upload a photo or camera capture (JPEG / PNG)."}
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                        <button
                          type="button"
                          onClick={() => setShowCameraModal(true)}
                          disabled={isProcessing}
                          className="flex items-center gap-2 bg-white hover:bg-neutral-200 text-black px-4 py-2.5 rounded-md font-semibold text-xs tracking-tight transition disabled:opacity-50 shadow-sm"
                        >
                          <Camera className="h-4 w-4 text-black" />
                          Live Camera Scanner
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isProcessing}
                          className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-700 px-4 py-2.5 rounded-md font-semibold text-xs tracking-tight transition disabled:opacity-50"
                        >
                          <Upload className="h-4 w-4" />
                          Upload File
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 bg-neutral-950 hover:bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800 px-3 py-2.5 rounded-md font-medium text-xs tracking-tight transition disabled:opacity-50"
                          title="Fallback: Open system device camera app"
                        >
                          <Camera className="h-3.5 w-3.5 text-neutral-500" />
                          <span className="hidden sm:inline">System App</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Status Banner */}
                {saveStatus.type && (
                  <div
                    className={`p-3.5 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-3 ${
                      saveStatus.type === "success"
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                        : saveStatus.type === "duplicate"
                        ? "bg-amber-950/40 border-amber-800 text-amber-300"
                        : "bg-red-950/40 border-red-800 text-red-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {saveStatus.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
                      {saveStatus.type === "duplicate" && <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />}
                      {saveStatus.type === "error" && <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                      <span>{saveStatus.message}</span>
                    </div>
                    {saveStatus.type === "success" && (
                      <button
                        onClick={() => {
                          setCurrentTransitRecord(null);
                          setCurrentInvoice(null);
                          setImagePreview(null);
                          setDetectedUniversalType(null);
                          setSaveStatus({ type: null, message: "" });
                        }}
                        className="underline text-emerald-200 hover:text-white font-medium"
                      >
                        Scan Next Document →
                      </button>
                    )}
                  </div>
                )}

                {/* 1. REVIEW SCREEN: TAX INVOICE (STRICT 9 FIELDS) */}
                {(selectedDocType === "invoice" || (selectedDocType === "universal" && detectedUniversalType?.type === "invoice")) && currentInvoice && (
                  <div className="space-y-4">
                    {/* Primary Key Action Bar */}
                    <div className="p-3.5 rounded-lg border border-neutral-800 bg-[#0d0d0d] flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-neutral-900 border border-neutral-700 flex items-center justify-center font-mono font-bold text-xs text-white">
                          PK
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">Invoice No (PK):</span>
                            <span className="font-mono text-sm font-bold text-white bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700">
                              {currentInvoice.invoiceNo || "MISSING"}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Unique Key
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                            Strict 9 fields marked in blue pen
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setCurrentInvoice(null);
                            setImagePreview(null);
                          }}
                          className="px-3 py-1.5 rounded text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition"
                        >
                          Discard
                        </button>
                        <button
                          onClick={handleSaveCurrentRecord}
                          disabled={!currentInvoice.invoiceNo}
                          className="px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-neutral-200 transition shadow-sm disabled:opacity-40 flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Save to Invoices Master Log
                        </button>
                      </div>
                    </div>

                    {/* Scanned Image Preview & Re-Crop / Re-Rotate Action */}
                    {imagePreview && (
                      <div className="p-3.5 rounded-xl border border-neutral-800 bg-[#0d0d0d] flex flex-wrap items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div
                            onClick={() => viewImageInNewTab(imagePreview)}
                            className="relative h-14 w-20 rounded border border-neutral-700 bg-black overflow-hidden flex-shrink-0 cursor-pointer group shadow-sm"
                            title="Click to view full image in new tab"
                          >
                            <img
                              src={imagePreview}
                              alt="Document Thumbnail"
                              className="h-full w-full object-cover group-hover:opacity-75 transition"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/50 transition text-white">
                              <Eye className="h-4 w-4" />
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                              <span>Source Invoice Image</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                                Scanned
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                              Compare extracted 9 blue pen fields against source capture
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleReCrop}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-700 text-xs font-mono font-medium transition"
                            title="Crop edges or rotate 90° and re-extract"
                          >
                            <Crop className="h-3.5 w-3.5 text-neutral-400" />
                            <span>Crop / Rotate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => viewImageInNewTab(imagePreview)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-700 text-xs font-mono font-medium transition"
                          >
                            <Eye className="h-3.5 w-3.5 text-neutral-400" />
                            <span>Full Image</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* The Strict 9 Fields Card */}
                    <div className="p-5 rounded-xl border border-neutral-800 bg-[#0a0a0a] shadow-lg">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-white" />
                          <h3 className="font-semibold text-sm text-white">
                            Tax Invoice — 9 Extracted Fields
                          </h3>
                        </div>
                        <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                          Blue Ink Verified
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* 1. Invoice No */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            1. Invoice No (PK)
                          </label>
                          <input
                            type="text"
                            value={currentInvoice.invoiceNo}
                            onChange={(e) => handleInvoiceFieldChange("invoiceNo", e.target.value)}
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono font-bold focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 2. Invoice Date */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            2. Invoice Date
                          </label>
                          <input
                            type="text"
                            value={currentInvoice.invoiceDate}
                            onChange={(e) => handleInvoiceFieldChange("invoiceDate", e.target.value)}
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 3. Bill To */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f] sm:col-span-2 lg:col-span-1">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            3. Bill To (Buyer / Consignee)
                          </label>
                          <input
                            type="text"
                            value={currentInvoice.billTo}
                            onChange={(e) => handleInvoiceFieldChange("billTo", e.target.value)}
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-medium focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 4. Quantity (MT) */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            4. Quantity (MT)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={currentInvoice.quantity ?? ""}
                            onChange={(e) =>
                              handleInvoiceFieldChange(
                                "quantity",
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono font-bold focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 5. Price / Unit */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            5. Price / Unit (Rate ₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={currentInvoice.ratePerUnit ?? ""}
                            onChange={(e) =>
                              handleInvoiceFieldChange(
                                "ratePerUnit",
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 6. Taxable Amount */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            6. Taxable Amount (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={currentInvoice.taxableAmount ?? ""}
                            onChange={(e) =>
                              handleInvoiceFieldChange(
                                "taxableAmount",
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 7. CGST Amount */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            7. CGST Amount (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={currentInvoice.cgstAmount ?? ""}
                            onChange={(e) =>
                              handleInvoiceFieldChange(
                                "cgstAmount",
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 8. SGST Amount */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            8. SGST Amount (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={currentInvoice.sgstAmount ?? ""}
                            onChange={(e) =>
                              handleInvoiceFieldChange(
                                "sgstAmount",
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 9. Total Invoice Amount */}
                        <div className="p-3 rounded-lg border border-neutral-700 bg-neutral-900">
                          <label className="block text-[11px] font-mono text-emerald-400 font-semibold mb-1">
                            9. Total Invoice Amount (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={currentInvoice.totalAmount ?? ""}
                            onChange={(e) =>
                              handleInvoiceFieldChange(
                                "totalAmount",
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            className="w-full bg-black border border-neutral-600 text-emerald-300 font-bold rounded px-3 py-2 text-base font-mono focus:border-white focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. REVIEW SCREEN: TRANSIT PASS (ORIGINAL OR DUPLICATE) */}
                {selectedDocType !== "invoice" && !(selectedDocType === "universal" && detectedUniversalType?.type === "invoice") && currentTransitRecord && (
                  <div className="space-y-4">
                    {/* Action Bar */}
                    <div className="p-3.5 rounded-lg border border-neutral-800 bg-[#0d0d0d] flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-neutral-900 border border-neutral-700 flex items-center justify-center font-mono font-bold text-xs text-white">
                          PK
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">Stationary No (PK):</span>
                            <span className="font-mono text-sm font-bold text-white bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700">
                              {currentTransitRecord.stationaryNo || "NOT FOUND"}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Unique Key Ready
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                            {selectedDocType === "universal" ? getDocTitle(detectedUniversalType?.type as DocumentTypeOption) : getDocTitle(selectedDocType)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setCurrentTransitRecord(null);
                            setImagePreview(null);
                          }}
                          className="px-3 py-1.5 rounded text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition"
                        >
                          Discard
                        </button>
                        <button
                          onClick={handleSaveCurrentRecord}
                          disabled={!currentTransitRecord.stationaryNo}
                          className="px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-neutral-200 transition shadow-sm disabled:opacity-40 flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Save to {getDocTitle(selectedDocType)} Master Log
                        </button>
                      </div>
                    </div>

                    {/* Scanned Image Preview & Re-Crop / Re-Rotate Action */}
                    {imagePreview && (
                      <div className="p-3.5 rounded-xl border border-neutral-800 bg-[#0d0d0d] flex flex-wrap items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div
                            onClick={() => viewImageInNewTab(imagePreview)}
                            className="relative h-14 w-20 rounded border border-neutral-700 bg-black overflow-hidden flex-shrink-0 cursor-pointer group shadow-sm"
                            title="Click to view full image in new tab"
                          >
                            <img
                              src={imagePreview}
                              alt="Document Thumbnail"
                              className="h-full w-full object-cover group-hover:opacity-75 transition"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/50 transition text-white">
                              <Eye className="h-4 w-4" />
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                              <span>Source Transit Form Image</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                                Scanned
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                              Compare extracted 6 key fields against source capture
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleReCrop}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-700 text-xs font-mono font-medium transition"
                            title="Crop edges or rotate 90° and re-extract"
                          >
                            <Crop className="h-3.5 w-3.5 text-neutral-400" />
                            <span>Crop / Rotate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => viewImageInNewTab(imagePreview)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-700 text-xs font-mono font-medium transition"
                          >
                            <Eye className="h-3.5 w-3.5 text-neutral-400" />
                            <span>Full Image</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 6 Key Priority Fields */}
                    <div className="p-5 rounded-xl border border-neutral-800 bg-[#0a0a0a] shadow-lg">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
                        <div className="flex items-center gap-2">
                          <div className="h-5 w-5 rounded bg-white text-black flex items-center justify-center font-bold text-[10px]">
                            6
                          </div>
                          <h3 className="font-semibold text-sm text-white">Key Verification Fields</h3>
                        </div>
                        <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                          Primary Fields
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* 1. Stationary No */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            1. Stationary No (PK)
                          </label>
                          <input
                            type="text"
                            value={currentTransitRecord.stationaryNo}
                            onChange={(e) => handleTransitFieldChange("stationaryNo", e.target.value)}
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono font-bold focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 2. Date */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            2. Date
                          </label>
                          <input
                            type="text"
                            value={currentTransitRecord.dispatchDate}
                            onChange={(e) => handleTransitFieldChange("dispatchDate", e.target.value)}
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 3. Consignee Name */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            3. Consignee Name
                          </label>
                          <input
                            type="text"
                            value={currentTransitRecord.mdlNameConsigneeName}
                            onChange={(e) =>
                              handleTransitFieldChange("mdlNameConsigneeName", e.target.value)
                            }
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-medium focus:border-white focus:outline-none"
                          />
                        </div>

                        {/* 4. Mineral Name */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            4. Mineral Name
                          </label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {MINERAL_GRADE_OPTIONS.map((opt) => {
                              const isSelected = currentTransitRecord.mineralName === opt.fullName;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => handleTransitFieldChange("mineralName", opt.fullName)}
                                  className={`py-1.5 px-2 rounded text-xs font-mono font-medium transition text-center border ${
                                    isSelected
                                      ? "bg-white text-black border-white font-bold shadow-sm"
                                      : "bg-black text-neutral-400 border-neutral-700 hover:text-white"
                                  }`}
                                >
                                  {opt.id}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 5. Vehicle Number */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            5. Vehicle Number
                          </label>
                          <input
                            type="text"
                            value={currentTransitRecord.vehicleNo}
                            onChange={(e) =>
                              handleTransitFieldChange("vehicleNo", e.target.value.toUpperCase())
                            }
                            className="w-full bg-black border border-neutral-700 text-white rounded px-3 py-2 text-sm font-mono font-bold focus:border-white focus:outline-none uppercase"
                          />
                        </div>

                        {/* 6. Dispatch / Production Qty */}
                        <div className="p-3 rounded-lg border border-neutral-800 bg-[#0f0f0f]">
                          <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                            6.{" "}
                            {selectedDocType === "transit_original"
                              ? "Production Qty (MT)"
                              : "Dispatch Qty (MT)"}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              value={
                                (selectedDocType === "transit_original"
                                  ? currentTransitRecord.productionQty ?? currentTransitRecord.dispatchQty
                                  : currentTransitRecord.dispatchQty ?? currentTransitRecord.productionQty) ?? ""
                              }
                              onChange={(e) => {
                                const val = e.target.value ? parseFloat(e.target.value) : null;
                                if (selectedDocType === "transit_original") {
                                  handleTransitFieldChange("productionQty", val);
                                } else {
                                  handleTransitFieldChange("dispatchQty", val);
                                }
                              }}
                              className="w-full bg-black border border-neutral-700 text-white rounded pl-3 pr-12 py-2 text-sm font-mono font-bold focus:border-white focus:outline-none"
                            />
                            <span className="absolute right-3 top-2.5 text-xs font-mono text-neutral-500 pointer-events-none">
                              MT
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* MASTER LOG TABLE WITH ADVANCED FILTERS (MONTH, START/END DATE, COMPANY, GRADE) */
              <div className="space-y-4">
                {/* Advanced Filter Toolbar */}
                <div className="p-4 rounded-xl border border-neutral-800 bg-[#0a0a0a] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-300 font-mono">
                      <Filter className="h-3.5 w-3.5 text-neutral-400" />
                      Filter {getDocTitle(selectedDocType)} Ledger
                    </div>
                    {hasActiveFilters && (
                      <button
                        onClick={resetFilters}
                        className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-mono transition"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset Filters
                      </button>
                    )}
                  </div>

                  <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${selectedDocType !== "invoice" ? "lg:grid-cols-6" : "lg:grid-cols-5"} gap-3`}>
                    {/* Filter 1: Search */}
                    <div>
                      <label className="block text-[10px] font-mono text-neutral-500 mb-1">
                        Search Keyword
                      </label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-500" />
                        <input
                          type="text"
                          placeholder={selectedDocType === "invoice" ? "Search invoice no..." : "Search stationary no, vehicle..."}
                          value={filters.search}
                          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                          className="w-full bg-black border border-neutral-800 text-white rounded pl-8 pr-2.5 py-1.5 text-xs font-mono focus:border-neutral-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Filter 2: Month */}
                    <div>
                      <label className="block text-[10px] font-mono text-neutral-500 mb-1 flex items-center justify-between">
                        <span>Month</span>
                        {filters.month && (
                          <button
                            type="button"
                            onClick={() => setFilters({ ...filters, month: "" })}
                            className="text-[9px] text-neutral-400 hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                        <input
                          type="month"
                          value={filters.month}
                          onClick={(e) => {
                            try {
                              e.currentTarget.showPicker?.();
                            } catch {}
                          }}
                          onChange={(e) => setFilters({ ...filters, month: e.target.value })}
                          className="w-full bg-black border border-neutral-800 text-white rounded pl-8 pr-2.5 py-1.5 text-xs font-mono focus:border-neutral-500 focus:outline-none cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                    </div>

                    {/* Filter 3: Start Date */}
                    <div>
                      <label className="block text-[10px] font-mono text-neutral-500 mb-1 flex items-center justify-between">
                        <span>Start Date</span>
                        {filters.startDate && (
                          <button
                            type="button"
                            onClick={() => setFilters({ ...filters, startDate: "" })}
                            className="text-[9px] text-neutral-400 hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                        <input
                          type="date"
                          value={filters.startDate}
                          onClick={(e) => {
                            try {
                              e.currentTarget.showPicker?.();
                            } catch {}
                          }}
                          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                          className="w-full bg-black border border-neutral-800 text-white rounded pl-8 pr-2.5 py-1.5 text-xs font-mono focus:border-neutral-500 focus:outline-none cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                    </div>

                    {/* Filter 4: End Date */}
                    <div>
                      <label className="block text-[10px] font-mono text-neutral-500 mb-1 flex items-center justify-between">
                        <span>End Date</span>
                        {filters.endDate && (
                          <button
                            type="button"
                            onClick={() => setFilters({ ...filters, endDate: "" })}
                            className="text-[9px] text-neutral-400 hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                        <input
                          type="date"
                          value={filters.endDate}
                          onClick={(e) => {
                            try {
                              e.currentTarget.showPicker?.();
                            } catch {}
                          }}
                          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                          className="w-full bg-black border border-neutral-800 text-white rounded pl-8 pr-2.5 py-1.5 text-xs font-mono focus:border-neutral-500 focus:outline-none cursor-pointer [color-scheme:dark]"
                        />
                      </div>
                    </div>

                    {/* Filter 5: Company / Consignee / Buyer */}
                    <div>
                      <label className="block text-[10px] font-mono text-neutral-500 mb-1">
                        {selectedDocType === "invoice" ? "Buyer / Company" : "Consignee / Company"}
                      </label>
                      <input
                        type="text"
                        placeholder={selectedDocType === "invoice" ? "e.g. Seth Nandram..." : "e.g. Renuka / APMDC..."}
                        value={filters.company}
                        onChange={(e) => setFilters({ ...filters, company: e.target.value })}
                        className="w-full bg-black border border-neutral-800 text-white rounded px-2.5 py-1.5 text-xs font-mono focus:border-neutral-500 focus:outline-none"
                      />
                    </div>

                    {/* Filter 6: Mineral Grade (for Transit Pass Duplicate & Original) */}
                    {selectedDocType !== "invoice" && (
                      <div>
                        <label className="block text-[10px] font-mono text-neutral-500 mb-1">
                          Mineral Grade
                        </label>
                        <select
                          value={filters.grade}
                          onChange={(e) => setFilters({ ...filters, grade: e.target.value })}
                          className="w-full bg-black border border-neutral-800 text-white rounded px-2.5 py-1.5 text-xs font-mono focus:border-neutral-500 focus:outline-none"
                        >
                          <option value="">All Grades</option>
                          <option value="A">Grade A</option>
                          <option value="B">Grade B</option>
                          <option value="C and D">Grade C & D</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Quick Calendar Presets */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-900 text-xs">
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-neutral-400" />
                      Quick Calendar:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date().toISOString().split("T")[0];
                        setFilters({ ...filters, startDate: today, endDate: today, month: "" });
                      }}
                      className="px-2.5 py-0.5 rounded text-[11px] font-mono bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const ym = new Date().toISOString().slice(0, 7);
                        setFilters({ ...filters, month: ym, startDate: "", endDate: "" });
                      }}
                      className="px-2.5 py-0.5 rounded text-[11px] font-mono bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition"
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(start.getDate() - 7);
                        setFilters({
                          ...filters,
                          startDate: start.toISOString().split("T")[0],
                          endDate: end.toISOString().split("T")[0],
                          month: "",
                        });
                      }}
                      className="px-2.5 py-0.5 rounded text-[11px] font-mono bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition"
                    >
                      Last 7 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(start.getDate() - 30);
                        setFilters({
                          ...filters,
                          startDate: start.toISOString().split("T")[0],
                          endDate: end.toISOString().split("T")[0],
                          month: "",
                        });
                      }}
                      className="px-2.5 py-0.5 rounded text-[11px] font-mono bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition"
                    >
                      Last 30 Days
                    </button>
                    {(filters.month || filters.startDate || filters.endDate) && (
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({ ...filters, month: "", startDate: "", endDate: "" })
                        }
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition sm:ml-auto"
                      >
                        ✕ Clear Dates
                      </button>
                    )}
                  </div>
                </div>

                {/* Master Log Header Bar */}
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-neutral-400">
                    Showing{" "}
                    <span className="text-white font-bold">
                      {selectedDocType === "invoice" ? invoices.length : transitRecords.length}
                    </span>{" "}
                    records in {getDocTitle(selectedDocType)}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadActiveData}
                      disabled={loadingData}
                      className="px-3 py-1.5 bg-[#0d0d0d] hover:bg-neutral-800 border border-neutral-800 text-neutral-300 rounded-md text-xs font-medium transition flex items-center gap-1.5"
                    >
                      <RefreshCw className={`h-3 w-3 ${loadingData ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                    <a
                      href={`/api/export?docType=${selectedDocType}&${buildQueryString()}`}
                      download
                      className="px-3 py-1.5 bg-white hover:bg-neutral-200 text-black rounded-md text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Download Filtered .xlsx
                    </a>
                  </div>
                </div>

                {/* TABLE 1: TAX INVOICE MASTER LOG (9 STRICT FIELDS) */}
                {selectedDocType === "invoice" ? (
                  <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-800 bg-neutral-900/60 font-mono text-[11px] text-neutral-400 uppercase tracking-wider">
                            <th className="py-2.5 px-4 font-semibold">1. Invoice No (PK)</th>
                            <th className="py-2.5 px-4 font-semibold">2. Date</th>
                            <th className="py-2.5 px-4 font-semibold">3. Bill To</th>
                            <th className="py-2.5 px-4 font-semibold">4. Qty (MT)</th>
                            <th className="py-2.5 px-4 font-semibold">5. Rate (₹)</th>
                            <th className="py-2.5 px-4 font-semibold">6. Taxable (₹)</th>
                            <th className="py-2.5 px-4 font-semibold">7. CGST (₹)</th>
                            <th className="py-2.5 px-4 font-semibold">8. SGST (₹)</th>
                            <th className="py-2.5 px-4 font-semibold">9. Total (₹)</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60">
                          {invoices.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="py-12 text-center text-neutral-500 font-mono">
                                {loadingData ? "Loading invoices..." : "No invoices found matching filters."}
                              </td>
                            </tr>
                          ) : (
                            invoices.map((inv) => (
                              <tr key={inv.invoiceNo} className="hover:bg-neutral-900/40 transition">
                                <td className="py-2.5 px-4 font-mono font-semibold text-white">
                                  <span className="bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-700">
                                    {inv.invoiceNo}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 font-mono text-neutral-300">
                                  {inv.invoiceDate}
                                </td>
                                <td className="py-2.5 px-4 text-neutral-200 font-medium max-w-[180px] truncate" title={inv.billTo}>
                                  {inv.billTo}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-neutral-200">
                                  {inv.quantity !== null ? `${inv.quantity} MT` : "-"}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-neutral-300">
                                  {inv.ratePerUnit !== null ? `₹${inv.ratePerUnit.toLocaleString("en-IN")}` : "-"}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-neutral-300">
                                  {inv.taxableAmount !== null ? `₹${inv.taxableAmount.toLocaleString("en-IN")}` : "-"}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-neutral-400">
                                  {inv.cgstAmount !== null ? `₹${inv.cgstAmount.toLocaleString("en-IN")}` : "-"}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-neutral-400">
                                  {inv.sgstAmount !== null ? `₹${inv.sgstAmount.toLocaleString("en-IN")}` : "-"}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-emerald-400 font-semibold">
                                  {inv.totalAmount !== null ? `₹${inv.totalAmount.toLocaleString("en-IN")}` : "-"}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleStartEditInvoice(inv)}
                                      className="p-1 rounded text-neutral-400 hover:text-blue-400 hover:bg-neutral-800"
                                      title="Edit"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDetailInvoice(inv)}
                                      className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800"
                                      title="View Details"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteInvoice(inv.invoiceNo)}
                                      className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-neutral-800"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* TABLE 2: TRANSIT PASS MASTER LOG (ORIGINAL OR DUPLICATE) */
                  <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-800 bg-neutral-900/60 font-mono text-[11px] text-neutral-400 uppercase tracking-wider">
                            <th className="py-2.5 px-4 font-semibold">1. Stationary No (PK)</th>
                            <th className="py-2.5 px-4 font-semibold">2. Date</th>
                            <th className="py-2.5 px-4 font-semibold">3. Consignee Name</th>
                            <th className="py-2.5 px-4 font-semibold">4. Mineral Name</th>
                            <th className="py-2.5 px-4 font-semibold">5. Vehicle Number</th>
                            <th className="py-2.5 px-4 font-semibold">
                              6.{" "}
                              {selectedDocType === "transit_original"
                                ? "Production Qty"
                                : "Dispatch Qty"}
                            </th>
                            <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60">
                          {transitRecords.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-12 text-center text-neutral-500 font-mono">
                                {loadingData
                                  ? "Loading records..."
                                  : `No records found in ${getDocTitle(selectedDocType)} Master Log.`}
                              </td>
                            </tr>
                          ) : (
                            transitRecords.map((r) => {
                              const qty =
                                selectedDocType === "transit_original"
                                  ? r.productionQty || r.dispatchQty
                                  : r.dispatchQty || r.productionQty;
                              return (
                                <tr key={r.stationaryNo} className="hover:bg-neutral-900/40 transition">
                                  <td className="py-2.5 px-4 font-mono font-medium text-white">
                                    <span className="bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700">
                                      {r.stationaryNo}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 font-mono text-neutral-300">
                                    {r.dispatchDate}
                                  </td>
                                  <td className="py-2.5 px-4 text-neutral-200 font-medium max-w-[200px] truncate" title={r.mdlNameConsigneeName}>
                                    {r.mdlNameConsigneeName}
                                  </td>
                                  <td className="py-2.5 px-4 font-mono">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-neutral-900 border border-neutral-700 text-neutral-300 font-medium">
                                      {r.mineralName.replace("Grey Barytes - ", "")}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 font-mono text-neutral-100 font-bold uppercase tracking-wider">
                                    {r.vehicleNo}
                                  </td>
                                  <td className="py-2.5 px-4 font-mono text-neutral-200 font-semibold">
                                    {qty !== null ? `${qty} MT` : "-"}
                                  </td>
                                  <td className="py-2.5 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => handleStartEditTransit(r)}
                                        className="p-1 rounded text-neutral-400 hover:text-blue-400 hover:bg-neutral-800"
                                        title="Edit Record"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setDetailTransitRecord(r)}
                                        className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800"
                                        title="View Record Details"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteTransit(r.stationaryNo)}
                                        className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-neutral-800"
                                        title="Delete"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {detailInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="max-w-xl w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-white" />
                <span className="font-mono text-sm font-bold text-white">
                  Invoice {detailInvoice.invoiceNo}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const inv = detailInvoice;
                    setDetailInvoice(null);
                    handleStartEditInvoice(inv);
                  }}
                  className="px-2.5 py-1 text-xs rounded bg-blue-600/20 text-blue-400 border border-blue-800 hover:bg-blue-600/30 flex items-center gap-1 font-mono transition"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  onClick={() => setDetailInvoice(null)}
                  className="text-neutral-400 hover:text-white text-xs font-mono"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-black border border-neutral-800">
                <span className="text-[10px] text-neutral-500 font-mono">Invoice Date</span>
                <div className="font-mono text-white mt-1">{detailInvoice.invoiceDate}</div>
              </div>
              <div className="p-2.5 rounded bg-black border border-neutral-800">
                <span className="text-[10px] text-neutral-500 font-mono">Quantity (MT)</span>
                <div className="font-mono text-white mt-1">{detailInvoice.quantity} MT</div>
              </div>
              <div className="p-2.5 rounded bg-black border border-neutral-800 col-span-2">
                <span className="text-[10px] text-neutral-500 font-mono">Bill To (Buyer)</span>
                <div className="text-white mt-1 font-medium">{detailInvoice.billTo}</div>
              </div>
              <div className="p-2.5 rounded bg-black border border-neutral-800">
                <span className="text-[10px] text-neutral-500 font-mono">Price / Unit</span>
                <div className="font-mono text-white mt-1">₹{detailInvoice.ratePerUnit?.toLocaleString("en-IN")}</div>
              </div>
              <div className="p-2.5 rounded bg-black border border-neutral-800">
                <span className="text-[10px] text-neutral-500 font-mono">Taxable Amount</span>
                <div className="font-mono text-white mt-1">₹{detailInvoice.taxableAmount?.toLocaleString("en-IN")}</div>
              </div>
              <div className="p-2.5 rounded bg-black border border-neutral-800">
                <span className="text-[10px] text-neutral-500 font-mono">CGST Amount</span>
                <div className="font-mono text-white mt-1">₹{detailInvoice.cgstAmount?.toLocaleString("en-IN")}</div>
              </div>
              <div className="p-2.5 rounded bg-black border border-neutral-800">
                <span className="text-[10px] text-neutral-500 font-mono">SGST Amount</span>
                <div className="font-mono text-white mt-1">₹{detailInvoice.sgstAmount?.toLocaleString("en-IN")}</div>
              </div>
              <div className="p-2.5 rounded bg-neutral-900 border border-neutral-700 col-span-2">
                <span className="text-[10px] text-emerald-400 font-mono">Total Invoice Amount</span>
                <div className="font-mono text-emerald-300 font-bold text-base mt-1">
                  ₹{detailInvoice.totalAmount?.toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            {detailInvoice.imageUrl && (
              <div className="mt-3 pt-3 border-t border-neutral-800">
                <div className="text-[10px] text-neutral-500 font-mono mb-2">Original Scanned Document</div>
                <div className="max-h-52 overflow-hidden rounded-lg border border-neutral-800 bg-black flex items-center justify-center">
                  <img src={detailInvoice.imageUrl} alt="Invoice Document" className="object-contain max-h-52 w-auto" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transit Detail Modal */}
      {detailTransitRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="max-w-2xl w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <span className="font-mono text-sm font-bold text-white bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700">
                {detailTransitRecord.stationaryNo}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const rec = detailTransitRecord;
                    setDetailTransitRecord(null);
                    handleStartEditTransit(rec);
                  }}
                  className="px-2.5 py-1 text-xs rounded bg-blue-600/20 text-blue-400 border border-blue-800 hover:bg-blue-600/30 flex items-center gap-1 font-mono transition"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  onClick={() => setDetailTransitRecord(null)}
                  className="text-neutral-400 hover:text-white text-xs font-mono"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              {TRANSIT_FIELD_METADATA.map((meta) => {
                const val = (detailTransitRecord as any)[meta.key];
                return (
                  <div key={meta.key} className="p-2.5 rounded bg-neutral-950 border border-neutral-800/80">
                    <div className="text-[10px] font-mono text-neutral-500 uppercase">{meta.label}</div>
                    <div className="text-neutral-200 mt-1 font-mono truncate">
                      {val !== null && val !== undefined && val !== "" ? String(val) : "-"}
                    </div>
                  </div>
                );
              })}
            </div>

            {detailTransitRecord.imageUrl && (
              <div className="mt-3 pt-3 border-t border-neutral-800">
                <div className="text-[10px] text-neutral-500 font-mono mb-2">Original Scanned Document</div>
                <div className="max-h-60 overflow-hidden rounded-lg border border-neutral-800 bg-black flex items-center justify-center">
                  <img src={detailTransitRecord.imageUrl} alt="Transit Document" className="object-contain max-h-60 w-auto" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Google Sheets Live Sync Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="max-w-lg w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Google Sheets Live Sync</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-neutral-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-300 flex items-start gap-2.5">
                <Cloud className="h-4 w-4 text-white shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-white text-xs">
                    Server-Side Google Sheets Sync
                  </div>
                  <div className="text-[11px] text-neutral-400 leading-relaxed">
                    Every saved record is stored in PostgreSQL and asynchronously synchronized to your live Google Sheet.
                  </div>
                </div>
              </div>

                <div className="p-3.5 rounded-lg border border-neutral-800 bg-[#080808] space-y-2.5">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-neutral-500">Webhook Source</span>
                    <span className="text-emerald-400 font-semibold">Loaded via server .env</span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-neutral-500">Target Tabs</span>
                    <span className="text-neutral-300">Transit Duplicate, Original, Invoices</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={testGoogleDriveConnection}
                    disabled={driveTesting}
                    className="px-3.5 py-1.5 bg-white hover:bg-neutral-200 text-black rounded text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className={`h-3 w-3 ${driveTesting ? "animate-spin" : ""}`} />
                    Test Live Connection
                  </button>

                  {driveTestMsg && (
                    <span
                      className={`text-[11px] font-mono ${
                        driveTestMsg.ok ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {driveTestMsg.ok ? "✓ " : "✕ "}
                      {driveTestMsg.text}
                    </span>
                  )}
                </div>

                {/* Turnkey Setup Steps */}
                <div className="p-3.5 rounded-lg border border-neutral-800 bg-[#080808] space-y-2.5">
                  <div className="font-semibold text-white flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider">
                    <span>⚡ Quick 60-Second Setup Guide</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-neutral-400 text-[11px] leading-relaxed">
                    <li>
                      Create a new Google Sheet at{" "}
                      <a
                        href="https://sheets.new"
                        target="_blank"
                        rel="noreferrer"
                        className="text-white underline hover:text-neutral-300 inline-flex items-center gap-0.5"
                      >
                        sheets.new <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </li>
                    <li>
                      In Google Sheets, go to <span className="text-white font-mono">Extensions &gt; Apps Script</span>
                    </li>
                    <li>
                      Replace the code with the script below and click <span className="text-white font-mono">Deploy &gt; New deployment</span>
                    </li>
                    <li>
                      Select type <span className="text-white font-mono">Web app</span>, set <em>Who has access</em> to <span className="text-white font-mono">&quot;Anyone&quot;</span>, and copy the Web App URL here!
                    </li>
                  </ol>

                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
                        setScriptCopied(true);
                        setTimeout(() => setScriptCopied(false), 2500);
                      }}
                      className="flex-1 py-1.5 px-3 rounded bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition flex items-center justify-center gap-1.5"
                    >
                      {scriptCopied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {scriptCopied ? "Script Copied to Clipboard!" : "Copy Google Apps Script"}
                    </button>
                    <button
                      onClick={() => setShowScriptCode(!showScriptCode)}
                      className="py-1.5 px-3 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono transition"
                    >
                      {showScriptCode ? "Hide Code" : "View Code"}
                    </button>
                  </div>

                  {showScriptCode && (
                    <div className="mt-2 p-2.5 rounded bg-black border border-neutral-800 max-h-48 overflow-y-auto font-mono text-[10px] text-neutral-400 select-all whitespace-pre">
                      {GOOGLE_APPS_SCRIPT_CODE}
                    </div>
                  )}

                  <div className="text-[10px] text-neutral-500 font-mono pt-1">
                    * Automatically creates 3 tabs: <span className="text-neutral-400">&quot;Transit Duplicate&quot;</span>, <span className="text-neutral-400">&quot;Transit Original&quot;</span>, and <span className="text-neutral-400">&quot;Tax Invoices&quot;</span>.
                  </div>
                </div>
              </div>

            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-1.5 text-xs font-semibold text-black bg-white hover:bg-neutral-200 rounded transition"
              >
                Close & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transit Record Modal */}
      {editingTransitRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="max-w-2xl w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">
                  Edit Transit Record ({editingTransitRecord.docType === "transit_original" ? "Original" : "Duplicate"})
                </h3>
              </div>
              <button
                onClick={() => setEditingTransitRecord(null)}
                className="text-neutral-400 hover:text-white text-xs font-mono"
              >
                ✕ Cancel
              </button>
            </div>

            <div className="space-y-4">
              {/* Primary Key (Immutable display) */}
              <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">Stationary No (Primary Key)</span>
                  <div className="font-mono text-sm font-bold text-white mt-0.5">{editingTransitRecord.stationaryNo}</div>
                </div>
                <span className="text-[10px] font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                  Fixed PK
                </span>
              </div>

              {/* Editable Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* 1. Date */}
                <div className="p-3 rounded-lg border border-neutral-800 bg-black">
                  <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                    Dispatch Date (DD-MM-YYYY)
                  </label>
                  <input
                    type="text"
                    value={editingTransitRecord.dispatchDate}
                    onChange={(e) =>
                      setEditingTransitRecord({ ...editingTransitRecord, dispatchDate: e.target.value })
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-3 py-1.5 text-xs font-mono focus:border-white focus:outline-none"
                  />
                </div>

                {/* 2. Vehicle No */}
                <div className="p-3 rounded-lg border border-neutral-800 bg-black">
                  <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={editingTransitRecord.vehicleNo}
                    onChange={(e) =>
                      setEditingTransitRecord({
                        ...editingTransitRecord,
                        vehicleNo: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
                      })
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-3 py-1.5 text-xs font-mono font-bold focus:border-white focus:outline-none uppercase"
                  />
                </div>

                {/* 3. Consignee Name */}
                <div className="p-3 rounded-lg border border-neutral-800 bg-black col-span-1 sm:col-span-2">
                  <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                    Consignee Name
                  </label>
                  <input
                    type="text"
                    value={editingTransitRecord.mdlNameConsigneeName}
                    onChange={(e) =>
                      setEditingTransitRecord({ ...editingTransitRecord, mdlNameConsigneeName: e.target.value })
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-3 py-1.5 text-xs font-medium focus:border-white focus:outline-none"
                  />
                </div>

                {/* 4. Mineral Grade */}
                <div className="p-3 rounded-lg border border-neutral-800 bg-black col-span-1 sm:col-span-2">
                  <label className="block text-[11px] font-mono text-neutral-400 mb-1.5">
                    Mineral Grade
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {MINERAL_GRADE_OPTIONS.map((opt) => {
                      const isSelected = editingTransitRecord.mineralName === opt.fullName;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setEditingTransitRecord({ ...editingTransitRecord, mineralName: opt.fullName })
                          }
                          className={`py-1.5 px-2 rounded text-xs font-mono transition text-center border ${
                            isSelected
                              ? "bg-white text-black border-white font-bold"
                              : "bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Quantity */}
                <div className="p-3 rounded-lg border border-neutral-800 bg-black col-span-1 sm:col-span-2">
                  <label className="block text-[11px] font-mono text-neutral-400 mb-1">
                    {editingTransitRecord.docType === "transit_original"
                      ? "Production Qty (MT)"
                      : "Dispatch Qty (MT)"}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={
                        (editingTransitRecord.docType === "transit_original"
                          ? editingTransitRecord.productionQty ?? editingTransitRecord.dispatchQty
                          : editingTransitRecord.dispatchQty ?? editingTransitRecord.productionQty) ?? ""
                      }
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        if (editingTransitRecord.docType === "transit_original") {
                          setEditingTransitRecord({ ...editingTransitRecord, productionQty: val, dispatchQty: val });
                        } else {
                          setEditingTransitRecord({ ...editingTransitRecord, dispatchQty: val });
                        }
                      }}
                      className="w-full bg-neutral-900 border border-neutral-700 text-white rounded pl-3 pr-12 py-1.5 text-xs font-mono font-bold focus:border-white focus:outline-none"
                    />
                    <span className="absolute right-3 top-2 text-xs font-mono text-neutral-500 pointer-events-none">
                      MT
                    </span>
                  </div>
                </div>
              </div>

              {/* Document Image in Edit Modal */}
              {editingTransitRecord.imageUrl && (
                <div className="pt-2 border-t border-neutral-800">
                  <div className="text-[10px] font-mono text-neutral-500 mb-1">Reference Document</div>
                  <div className="max-h-40 overflow-hidden rounded border border-neutral-800 bg-black flex items-center justify-center">
                    <img src={editingTransitRecord.imageUrl} alt="Document" className="object-contain max-h-40 w-auto" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setEditingTransitRecord(null)}
                className="px-3.5 py-1.5 rounded text-xs font-mono text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditTransit}
                disabled={editSaving}
                className="px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-neutral-200 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="max-w-xl w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">
                  Edit Tax Invoice
                </h3>
              </div>
              <button
                onClick={() => setEditingInvoice(null)}
                className="text-neutral-400 hover:text-white text-xs font-mono"
              >
                ✕ Cancel
              </button>
            </div>

            <div className="space-y-3">
              {/* PK Badge */}
              <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">Invoice No (Primary Key)</span>
                  <div className="font-mono text-sm font-bold text-white mt-0.5">{editingInvoice.invoiceNo}</div>
                </div>
                <span className="text-[10px] font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                  Fixed PK
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Invoice Date */}
                <div className="p-2.5 rounded bg-black border border-neutral-800">
                  <label className="block text-[10px] font-mono text-neutral-400 mb-1">Invoice Date</label>
                  <input
                    type="text"
                    value={editingInvoice.invoiceDate}
                    onChange={(e) => setEditingInvoice({ ...editingInvoice, invoiceDate: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs font-mono focus:border-white focus:outline-none"
                  />
                </div>

                {/* Quantity */}
                <div className="p-2.5 rounded bg-black border border-neutral-800">
                  <label className="block text-[10px] font-mono text-neutral-400 mb-1">Quantity (MT)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingInvoice.quantity ?? ""}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        quantity: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs font-mono focus:border-white focus:outline-none"
                  />
                </div>

                {/* Bill To */}
                <div className="p-2.5 rounded bg-black border border-neutral-800 col-span-2">
                  <label className="block text-[10px] font-mono text-neutral-400 mb-1">Bill To (Buyer / Consignee)</label>
                  <input
                    type="text"
                    value={editingInvoice.billTo}
                    onChange={(e) => setEditingInvoice({ ...editingInvoice, billTo: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs focus:border-white focus:outline-none"
                  />
                </div>

                {/* Rate Per Unit */}
                <div className="p-2.5 rounded bg-black border border-neutral-800">
                  <label className="block text-[10px] font-mono text-neutral-400 mb-1">Rate per Unit (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingInvoice.ratePerUnit ?? ""}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        ratePerUnit: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs font-mono focus:border-white focus:outline-none"
                  />
                </div>

                {/* Taxable Amount */}
                <div className="p-2.5 rounded bg-black border border-neutral-800">
                  <label className="block text-[10px] font-mono text-neutral-400 mb-1">Taxable Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingInvoice.taxableAmount ?? ""}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        taxableAmount: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs font-mono focus:border-white focus:outline-none"
                  />
                </div>

                {/* CGST */}
                <div className="p-2.5 rounded bg-black border border-neutral-800">
                  <label className="block text-[10px] font-mono text-neutral-400 mb-1">CGST Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingInvoice.cgstAmount ?? ""}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        cgstAmount: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs font-mono focus:border-white focus:outline-none"
                  />
                </div>

                {/* SGST */}
                <div className="p-2.5 rounded bg-black border border-neutral-800">
                  <label className="block text-[10px] font-mono text-neutral-400 mb-1">SGST Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingInvoice.sgstAmount ?? ""}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        sgstAmount: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded px-2.5 py-1 text-xs font-mono focus:border-white focus:outline-none"
                  />
                </div>

                {/* Total Amount */}
                <div className="p-2.5 rounded bg-neutral-950 border border-neutral-700 col-span-2">
                  <label className="block text-[10px] font-mono text-emerald-400 mb-1 font-semibold">Total Invoice Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingInvoice.totalAmount ?? ""}
                    onChange={(e) =>
                      setEditingInvoice({
                        ...editingInvoice,
                        totalAmount: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full bg-black border border-neutral-600 text-emerald-300 font-bold rounded px-2.5 py-1.5 text-sm font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Document Image in Edit Modal */}
              {editingInvoice.imageUrl && (
                <div className="pt-2 border-t border-neutral-800">
                  <div className="text-[10px] font-mono text-neutral-500 mb-1">Reference Document</div>
                  <div className="max-h-40 overflow-hidden rounded border border-neutral-800 bg-black flex items-center justify-center">
                    <img src={editingInvoice.imageUrl} alt="Document" className="object-contain max-h-40 w-auto" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setEditingInvoice(null)}
                className="px-3.5 py-1.5 rounded text-xs font-mono text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditInvoice}
                disabled={editSaving}
                className="px-4 py-1.5 rounded text-xs font-semibold text-black bg-white hover:bg-neutral-200 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Modal */}
      <LiveCameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handleCameraCapture}
        docTitle={getDocTitle(selectedDocType)}
      />

      {/* Image Cropper & Rotator Modal */}
      <ImageCropperModal
        isOpen={showCropperModal}
        imageSrc={rawCropImage}
        onClose={() => setShowCropperModal(false)}
        onApplyCrop={handleCropperComplete}
        docTitle={getDocTitle(selectedDocType)}
      />

      {/* Footer */}
      <footer className="border-t border-[#1f1f1f] bg-[#050505] py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-mono text-neutral-500">
          <div>
            AP Mines Data Portal • 3 Dedicated Workflows: Transit Duplicate, Transit Original, Tax Invoice
          </div>
          <div className="flex items-center gap-3">
            <span>Primary Keys: stationaryNo / invoiceNo</span>
            <span>•</span>
            <span>PostgreSQL (5433)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
