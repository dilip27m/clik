import { NextRequest, NextResponse } from "next/server";
import { extractTransitForm, extractTaxInvoice } from "@/lib/extractor";
import { getAllTransitRecords } from "@/lib/db";
import { DocumentTypeOption } from "@/types/transit";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    let base64Image = "";
    let mimeType = "image/jpeg";
    let docType: DocumentTypeOption = "transit_duplicate";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      docType = (formData.get("docType") as DocumentTypeOption) || "transit_duplicate";

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
      docType = json.docType || "transit_duplicate";
    }

    if (!base64Image) {
      return NextResponse.json(
        { success: false, error: "Image data is empty or invalid" },
        { status: 400 }
      );
    }

    // 1. Tax Invoice Extraction
    if (docType === "invoice") {
      const result = await extractTaxInvoice(base64Image, mimeType);
      if (result.isWrongDocument) {
        return NextResponse.json(
          {
            success: false,
            isWrongDocument: true,
            error:
              result.rejectionReason ||
              "Invalid Document: The uploaded image is not a Tax Invoice.",
          },
          { status: 422 }
        );
      }
      return NextResponse.json({
        success: true,
        data: result.data,
        isInvoice: true,
        source: result.source,
      });
    }

    // 2. Transit Form Extraction (Original or Duplicate)
    let existingKeys: string[] = [];
    try {
      const { records } = await getAllTransitRecords({}, docType);
      existingKeys = records.map((r) => r.stationaryNo.trim().toUpperCase());
    } catch (dbErr) {
      console.warn("[API /api/extract] Could not fetch existing keys for duplicate check:", dbErr);
    }

    const result = await extractTransitForm(
      base64Image,
      mimeType,
      existingKeys,
      docType
    );

    if (result.isWrongDocument) {
      return NextResponse.json(
        {
          success: false,
          isWrongDocument: true,
          error:
            result.rejectionReason ||
            "Invalid Document: The uploaded image does not appear to be an AP Mines Transit Form.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      validation: result.validation,
      isInvoice: false,
      source: result.source,
    });
  } catch (error: any) {
    console.error("[API /api/extract Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to extract document data" },
      { status: 500 }
    );
  }
}
