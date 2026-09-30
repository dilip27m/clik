import { NextRequest, NextResponse } from "next/server";
import { classifyAndExtract } from "@/lib/extractor";
import { getAllTransitRecords } from "@/lib/db";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    let base64Image = "";
    let mimeType = "image/jpeg";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No image file provided" },
          { status: 400 }
        );
      }

      mimeType = file.type || "image/jpeg";
      const bytes = await file.arrayBuffer();
      base64Image = Buffer.from(bytes).toString("base64");
    } else {
      const json = await req.json();
      base64Image = json.base64 || json.image || "";
      mimeType = json.mimeType || "image/jpeg";
    }

    if (!base64Image) {
      return NextResponse.json(
        { success: false, error: "Image data is empty or invalid" },
        { status: 400 }
      );
    }

    // Gather existing transit keys for duplicate detection during extraction
    let existingKeys: string[] = [];
    try {
      const { records: dupRecords } = await getAllTransitRecords({}, "transit_duplicate");
      const { records: origRecords } = await getAllTransitRecords({}, "transit_original");
      existingKeys = [
        ...dupRecords.map((r) => r.stationaryNo.trim().toUpperCase()),
        ...origRecords.map((r) => r.stationaryNo.trim().toUpperCase()),
      ];
    } catch (e) {
      console.warn("[Universal] Could not fetch existing transit keys:", e);
    }

    // Universal classify + extract
    const result = await classifyAndExtract(base64Image, mimeType, existingKeys);

    if (!result.success || result.isWrongDocument) {
      return NextResponse.json(
        {
          success: false,
          isWrongDocument: true,
          detectedType: result.detectedType,
          classification: result.classification,
          error:
            result.rejectionReason ||
            "Unable to identify the uploaded document. Please upload an AP Mines Transit Form or Tax Invoice.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      detectedType: result.detectedType,
      classification: result.classification,
      data: result.data,
      validation: result.validation,
      isInvoice: result.isInvoice,
      source: result.source,
    });
  } catch (error: any) {
    console.error("[API /api/extract/universal Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to classify and extract document" },
      { status: 500 }
    );
  }
}
