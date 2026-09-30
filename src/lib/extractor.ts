import { GoogleGenAI } from "@google/genai";
import {
  TransitRecord,
  InvoiceRecord,
  DocumentTypeOption,
} from "@/types/transit";
import { validateTransitRecord, normalizeDate } from "./validation";

// Simplified Prompt — 6 Core Fields Only
const TRANSIT_EXTRACTION_PROMPT = `
You are an expert OCR engine for Government of Andhra Pradesh - Department of Mines and Geology Transit Forms.

FIRST: Verify this is an AP Mines Transit Form.
Official markers: "GOVERNMENT OF ANDHRA PRADESH", "DEPARTMENT OF MINES AND GEOLOGY", "TRANSIT FORM" or "TRANSIT PASS".
If this is NOT a Transit Form (e.g. an Invoice or unrelated document):
return { "isWrongDocument": true, "rejectionReason": "Invalid Document: The uploaded image does not appear to be an AP Mines Transit Form." }

IDENTIFY DOCUMENT TYPE:
1. "transit_original": Header has "FORM E" / "TRANSIT PASS (Original)". Stationary No starts with "MDLA". Quantity is labeled "PRODUCTION QUANTITY (MT)".
2. "transit_duplicate": Header has "TRANSIT FORM (Duplicate)" / "OMMS 2.0". Stationary No starts with "DD". Quantity is labeled "Dispatch Qty".

EXTRACT ONLY THESE 6 CORE FIELDS:
1. stationaryNo: Stationary number near header (e.g., "DD 3111657" → clean as "DD3111657", or "MDLA8102983"). Remove all spaces.
2. dispatchDate: Date of dispatch ONLY (no time). Return as DD-MM-YYYY format (e.g., "24-09-2026").
3. mdlNameConsigneeName: Consignee name from "MDL Name / Consignee Name:" or "Consignee Name:".
4. mineralName: MUST be exactly one of: "Grey Barytes - A", "Grey Barytes - B", or "Grey Barytes - C and D".
5. vehicleNo: Vehicle number (e.g., "AP27UB5157"). Remove all spaces and hyphens.
6. dispatchQty: For Duplicate → "Dispatch Qty" in MT. For Original → "PRODUCTION QUANTITY (MT)" or "Dispatched Quantity". Always a number.

Return valid JSON:
{
  "isWrongDocument": false,
  "detectedDocType": "transit_original" | "transit_duplicate",
  "stationaryNo": string,
  "dispatchDate": string,
  "mdlNameConsigneeName": string,
  "mineralName": "Grey Barytes - C and D" | "Grey Barytes - A" | "Grey Barytes - B",
  "vehicleNo": string,
  "dispatchQty": number
}
`;

// Prompt for Tax Invoices (Strict 9 Fields)
const INVOICE_EXTRACTION_PROMPT = `
You are an expert OCR engine specifically designed for Tax Invoices.
Extract the STRICT 9 FIELDS from the Tax Invoice document:

1. invoiceNo (PRIMARY KEY): The invoice number (e.g., "2026-27/1" under "No:").
2. invoiceDate: The date of the invoice (e.g., "06/04/2026" under "Date:"). Date only, no time.
3. billTo: Full name of the buyer/consignee under "Bill To:" (e.g., "SETH NANDRAM DAULATRAM BIYANI INDIA PRIVATE LIMITED").
4. quantity: Total quantity in Metric Tons (number, e.g., 270).
5. ratePerUnit: Price or rate per unit in Rupees (number, e.g., 4900.00).
6. taxableAmount: Total taxable amount before GST in Rupees (number, e.g., 1323000.00).
7. cgstAmount: CGST amount in Rupees (number, e.g., 33075.00).
8. sgstAmount: SGST amount in Rupees (number, e.g., 33075.00).
9. totalAmount: Grand total / total invoice amount in Rupees (number, e.g., 1389150.00).

If the document is NOT a Tax Invoice:
return { "isWrongDocument": true, "rejectionReason": "Invalid Document: The uploaded image is not a Tax Invoice." }

Return strictly valid JSON:
{
  "isWrongDocument": false,
  "invoiceNo": string,
  "invoiceDate": string,
  "billTo": string,
  "quantity": number,
  "ratePerUnit": number,
  "taxableAmount": number,
  "cgstAmount": number,
  "sgstAmount": number,
  "totalAmount": number
}
`;

export function normalizeMineralGrade(raw: string): string {
  const upper = (raw || "").toUpperCase();
  if (upper.includes("C") || upper.includes("D")) return "Grey Barytes - C and D";
  if (upper.includes("B")) return "Grey Barytes - B";
  if (upper.includes("A")) return "Grey Barytes - A";
  return "Grey Barytes - C and D";
}

// Robust JSON extraction from Gemini responses (handles code fences, preamble text, etc.)
export function parseGeminiJson<T = any>(rawText: string): T {
  const clean = (rawText || "").trim();
  // 1. Try direct parse
  try {
    return JSON.parse(clean);
  } catch {}

  // 2. Try extracting from ```json ... ``` or ``` ... ```
  const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 3. Try finding first '{' and last '}'
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = clean.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error(`Invalid JSON returned by AI: ${clean.slice(0, 150)}`);
}

// Fast and active models verified against Google Gemini API
const CANDIDATE_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-flash-lite-latest",
];

function getServerKeyPool(): string[] {
  const pool: string[] = [];
  if (process.env.GEMINI_API_KEYS) {
    for (const k of process.env.GEMINI_API_KEYS.split(",")) {
      const clean = k.trim();
      if (clean && !pool.includes(clean)) pool.push(clean);
    }
  }
  if (process.env.GEMINI_API_KEY) {
    const clean = process.env.GEMINI_API_KEY.trim();
    if (clean && !pool.includes(clean)) pool.push(clean);
  }
  return pool;
}

// Extract Transit Form — 6 Core Fields Only
export async function extractTransitForm(
  base64Image: string,
  mimeType: string = "image/jpeg",
  existingKeys: string[] = [],
  docType: DocumentTypeOption = "transit_duplicate"
) {
  const keyPool = getServerKeyPool();
  if (keyPool.length === 0) {
    throw new Error("Server configuration error: Gemini API keys not found in .env.");
  }

  const cleanBase64 = (base64Image || "").replace(/^data:[^;]+;base64,/, "").trim();

  for (let i = 0; i < keyPool.length; i++) {
    const currentKey = keyPool[i];
    const ai = new GoogleGenAI({ apiKey: currentKey });

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { text: TRANSIT_EXTRACTION_PROMPT },
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType,
                  },
                },
              ],
            },
          ],
        });

        const responseText = response.text || "";
        const parsed = parseGeminiJson<any>(responseText);

        if (parsed.isWrongDocument) {
          return {
            data: {} as TransitRecord,
            validation: { isValid: false, warnings: [], fieldErrors: {} },
            isWrongDocument: true,
            rejectionReason: parsed.rejectionReason,
            source: "gemini-vision",
          };
        }

        const detected = parsed.detectedDocType;
        const cleanStationary = (parsed.stationaryNo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

        // Strict Check: User uploaded Duplicate in Original mode
        if (docType === "transit_original" && (detected === "transit_duplicate" || cleanStationary.startsWith("DD"))) {
          return {
            data: {} as TransitRecord,
            validation: { isValid: false, warnings: [], fieldErrors: {} },
            isWrongDocument: true,
            rejectionReason: `Wrong Document: You uploaded a Transit Duplicate Form (Stationary No '${cleanStationary}'). You are currently inside Transit Original mode. This document will not be processed or saved.`,
            source: "gemini-vision",
          };
        }

        // Strict Check: User uploaded Original in Duplicate mode
        if (docType === "transit_duplicate" && (detected === "transit_original" || cleanStationary.startsWith("MDLA"))) {
          return {
            data: {} as TransitRecord,
            validation: { isValid: false, warnings: [], fieldErrors: {} },
            isWrongDocument: true,
            rejectionReason: `Wrong Document: You uploaded a Transit Original Form E (Stationary No '${cleanStationary}'). You are currently inside Transit Duplicate mode. This document will not be processed or saved.`,
            source: "gemini-vision",
          };
        }

        const finalDocType = detected || docType || "transit_duplicate";
        const isOriginal = docType === "transit_original" || finalDocType === "transit_original";
        const qtyVal = parsed.dispatchQty !== null && parsed.dispatchQty !== undefined
          ? Number(parsed.dispatchQty)
          : (parsed.productionQty !== null && parsed.productionQty !== undefined ? Number(parsed.productionQty) : null);

        const cleanedData: TransitRecord = {
          stationaryNo: (parsed.stationaryNo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
          docType: docType || detected,
          dispatchDate: normalizeDate(parsed.dispatchDate),
          mdlNameConsigneeName: parsed.mdlNameConsigneeName || "",
          mineralName: normalizeMineralGrade(parsed.mineralName),
          vehicleNo: (parsed.vehicleNo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
          dispatchQty: qtyVal,
          productionQty: isOriginal ? qtyVal : null,
        };

        const validation = validateTransitRecord(cleanedData, existingKeys);
        return {
          data: cleanedData,
          validation,
          isWrongDocument: false,
          source: "gemini-vision",
        };
      } catch (err: any) {
        console.warn(`[Vision Extractor] Model ${modelName} failed on key index ${i}:`, err.message?.slice(0, 100));
      }
    }
  }

  throw new Error("OCR extraction failed. Please ensure the document is clear, well-lit, and properly oriented.");
}

// Extract Tax Invoice (Strict 9 Fields)
export async function extractTaxInvoice(
  base64Image: string,
  mimeType: string = "image/jpeg"
): Promise<{
  data: InvoiceRecord;
  isWrongDocument?: boolean;
  rejectionReason?: string;
  source: string;
}> {
  const keyPool = getServerKeyPool();
  if (keyPool.length === 0) {
    throw new Error("Server configuration error: Gemini API keys not found in .env.");
  }

  const cleanBase64 = (base64Image || "").replace(/^data:[^;]+;base64,/, "").trim();

  for (let i = 0; i < keyPool.length; i++) {
    const currentKey = keyPool[i];
    const ai = new GoogleGenAI({ apiKey: currentKey });

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { text: INVOICE_EXTRACTION_PROMPT },
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType,
                  },
                },
              ],
            },
          ],
        });

        const responseText = response.text || "";
        const parsed = parseGeminiJson<any>(responseText);

        if (parsed.isWrongDocument) {
          return {
            data: {} as InvoiceRecord,
            isWrongDocument: true,
            rejectionReason: parsed.rejectionReason,
            source: "gemini-vision",
          };
        }

        const invoiceData: InvoiceRecord = {
          invoiceNo: (parsed.invoiceNo || "").trim(),
          invoiceDate: normalizeDate(parsed.invoiceDate),
          billTo: (parsed.billTo || "").trim(),
          quantity: parsed.quantity !== null && parsed.quantity !== undefined ? Number(parsed.quantity) : null,
          ratePerUnit: parsed.ratePerUnit !== null && parsed.ratePerUnit !== undefined ? Number(parsed.ratePerUnit) : null,
          taxableAmount: parsed.taxableAmount !== null && parsed.taxableAmount !== undefined ? Number(parsed.taxableAmount) : null,
          cgstAmount: parsed.cgstAmount !== null && parsed.cgstAmount !== undefined ? Number(parsed.cgstAmount) : null,
          sgstAmount: parsed.sgstAmount !== null && parsed.sgstAmount !== undefined ? Number(parsed.sgstAmount) : null,
          totalAmount: parsed.totalAmount !== null && parsed.totalAmount !== undefined ? Number(parsed.totalAmount) : null,
        };

        return {
          data: invoiceData,
          isWrongDocument: false,
          source: "gemini-vision",
        };
      } catch (err: any) {
        console.warn(`[Invoice Extractor] Model ${modelName} failed on key index ${i}:`, err.message?.slice(0, 100));
      }
    }
  }

  throw new Error("OCR extraction failed. Please ensure the invoice is clear, well-lit, and properly oriented.");
}

// ────── Universal Document Classifier ──────
// First classifies the document type, then delegates to the correct extractor.
const UNIVERSAL_CLASSIFICATION_PROMPT = `
You are an expert document classifier for the Government of Andhra Pradesh – Department of Mines and Geology.

Look at this image and classify it into ONE of these 3 categories:

1. "transit_duplicate" — Transit Form (Duplicate) / OMMS 2.0 form. Header says "TRANSIT FORM (Duplicate)". Stationary No starts with "DD".
2. "transit_original" — Form E / Transit Pass (Original). Header says "FORM E" or "TRANSIT PASS (Original)". Stationary No starts with "MDLA".
3. "invoice" — A Tax Invoice / Commercial Invoice. Contains "Tax Invoice", "Invoice No", "Bill To", "CGST", "SGST", etc.

If the image is NONE of these (random photo, unrelated document, etc.):
return { "documentType": "unknown", "confidence": 0, "reason": "This image does not appear to be any recognized AP Mines document." }

Return valid JSON:
{
  "documentType": "transit_duplicate" | "transit_original" | "invoice" | "unknown",
  "confidence": number (0-100),
  "reason": string (brief one-line explanation)
}
`;

export type ClassificationResult = {
  documentType: "transit_duplicate" | "transit_original" | "invoice" | "unknown";
  confidence: number;
  reason: string;
};

export async function classifyDocument(
  base64Image: string,
  mimeType: string = "image/jpeg"
): Promise<ClassificationResult> {
  const keyPool = getServerKeyPool();
  if (keyPool.length === 0) {
    throw new Error("Server configuration error: Gemini API keys not found in .env.");
  }

  const cleanBase64 = (base64Image || "").replace(/^data:[^;]+;base64,/, "").trim();

  for (let i = 0; i < keyPool.length; i++) {
    const currentKey = keyPool[i];
    const ai = new GoogleGenAI({ apiKey: currentKey });

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { text: UNIVERSAL_CLASSIFICATION_PROMPT },
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType,
                  },
                },
              ],
            },
          ],
        });

        const responseText = response.text || "";
        const parsed = parseGeminiJson<any>(responseText);

        return {
          documentType: parsed.documentType || "unknown",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
          reason: parsed.reason || "No reason provided",
        };
      } catch (err: any) {
        console.warn(`[Classifier] Model ${modelName} failed on key index ${i}:`, err.message?.slice(0, 100));
      }
    }
  }

  throw new Error("Document classification failed. Please ensure the image is clear and well-lit.");
}

// Universal extraction: classify first, then extract with the right extractor
export async function classifyAndExtract(
  base64Image: string,
  mimeType: string = "image/jpeg",
  existingTransitKeys: string[] = []
) {
  // Step 1: Classify
  const classification = await classifyDocument(base64Image, mimeType);

  if (classification.documentType === "unknown" || classification.confidence < 30) {
    return {
      success: false,
      isWrongDocument: true,
      detectedType: "unknown" as const,
      classification,
      rejectionReason: classification.reason || "Unable to identify this document. Please upload an AP Mines Transit Form or Tax Invoice.",
    };
  }

  // Step 2: Extract based on classified type
  const detectedType = classification.documentType;

  if (detectedType === "invoice") {
    const result = await extractTaxInvoice(base64Image, mimeType);
    return {
      success: !result.isWrongDocument,
      isWrongDocument: result.isWrongDocument || false,
      detectedType,
      classification,
      rejectionReason: result.rejectionReason,
      data: result.data,
      isInvoice: true,
      source: result.source,
    };
  }

  // Transit form (original or duplicate)
  const result = await extractTransitForm(
    base64Image,
    mimeType,
    existingTransitKeys,
    detectedType // pass detected type so cross-type validation is skipped
  );

  return {
    success: !result.isWrongDocument,
    isWrongDocument: result.isWrongDocument || false,
    detectedType,
    classification,
    rejectionReason: result.isWrongDocument
      ? (result as any).rejectionReason
      : undefined,
    data: result.data,
    validation: result.validation,
    isInvoice: false,
    source: result.source,
  };
}
