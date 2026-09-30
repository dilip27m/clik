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
4. mineralName: MUST be exactly one of: "Grey Barytes - A", "Grey Barytes - B", or "Grey Barytes - C and D". Look carefully at the printed or handwritten grade: if it indicates "A", "Grade A", or "A Grade", return "Grey Barytes - A"; if "B", "Grade B", or "B Grade", return "Grey Barytes - B"; if "C & D", "C and D", "C", or "D", return "Grey Barytes - C and D". CRITICAL: Do NOT mistake the letter 'D' in the English word 'GRADE' as Grade D!
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
  const text = (raw || "").trim().toUpperCase();
  if (!text) return "Grey Barytes - C and D";

  // Check C & D first (e.g. "C & D", "C AND D", "C+D")
  if (/\bC\s*(&|AND|\+)?\s*D\b/i.test(text)) {
    return "Grey Barytes - C and D";
  }

  // Strip noise words that contain letters A, B, C, D (e.g. 'AND', 'BARYTES', 'GREY', 'GRADE')
  const stripped = text
    .replace(/\bAND\b/gi, " ")
    .replace(/\bBARYTES\b/gi, " ")
    .replace(/\bGREY\b/gi, " ")
    .replace(/\bGRADE\b/gi, " ");

  const hasA = /\bA\b/.test(stripped);
  const hasB = /\bB\b/.test(stripped);
  const hasC = /\bC\b/.test(stripped);
  const hasD = /\bD\b/.test(stripped);

  if (hasA && !hasB && !hasC && !hasD) return "Grey Barytes - A";
  if (hasB && !hasA && !hasC && !hasD) return "Grey Barytes - B";
  if (hasC || hasD) return "Grey Barytes - C and D";

  if (text.includes("- A") || text.includes("GRADE A") || text.includes("A GRADE")) return "Grey Barytes - A";
  if (text.includes("- B") || text.includes("GRADE B") || text.includes("B GRADE")) return "Grey Barytes - B";

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

// ────── Universal Single-Pass Classifier & Extractor ──────
// Uses a unified single-pass prompt so document classification and field extraction
// happen in ONE API roundtrip (~3-4s) instead of two sequential roundtrips (~16s).
const UNIVERSAL_SINGLE_PASS_PROMPT = `
You are an expert OCR and document classification engine for the Government of Andhra Pradesh – Department of Mines and Geology.

TASK:
1. Examine the image and determine its document type:
   - "transit_original": Header has "FORM E" or "TRANSIT PASS (Original)". Stationary No starts with "MDLA". Quantity is "PRODUCTION QUANTITY (MT)".
   - "transit_duplicate": Header has "TRANSIT FORM (Duplicate)" or "OMMS 2.0". Stationary No starts with "DD". Quantity is "Dispatch Qty".
   - "invoice": Tax Invoice / Commercial Invoice. Contains "Tax Invoice", "Invoice No", "Bill To", "CGST", "SGST", etc.
   - "unknown": None of the above (unrelated image, illegible photo, etc.).

2. Extract all corresponding fields:

If Transit Form ("transit_duplicate" or "transit_original"):
- stationaryNo: Clean alphanumeric string without spaces (e.g. "DD3111657", "MDLA8102983")
- dispatchDate: DD-MM-YYYY format only (e.g. "24-09-2026")
- mdlNameConsigneeName: Consignee name from "MDL Name / Consignee Name:"
- mineralName: MUST be strictly one of: "Grey Barytes - A", "Grey Barytes - B", or "Grey Barytes - C and D". Look carefully at the grade letter: "A" / "Grade A" -> "Grey Barytes - A"; "B" / "Grade B" -> "Grey Barytes - B"; "C & D" / "C and D" / "C" / "D" -> "Grey Barytes - C and D". Do NOT mistake the English letter D in the word 'GRADE' for Grade D!
- vehicleNo: Alphanumeric string without spaces/hyphens (e.g. "AP27UB5157")
- dispatchQty: Numeric quantity in MT
- productionQty: Numeric quantity in MT (for original form)

If Tax Invoice ("invoice"):
- invoiceNo: Primary key invoice number (e.g. "2026-27/1")
- invoiceDate: Date string (e.g. "06/04/2026")
- billTo: Buyer/Consignee full name
- quantity: Numeric MT
- ratePerUnit: Price in Rupees
- taxableAmount: Taxable amount in Rupees
- cgstAmount: CGST amount in Rupees
- sgstAmount: SGST amount in Rupees
- totalAmount: Grand total in Rupees

Return valid JSON:
{
  "detectedDocType": "transit_duplicate" | "transit_original" | "invoice" | "unknown",
  "confidence": number,
  "isWrongDocument": boolean,
  "rejectionReason": string,
  "stationaryNo": string,
  "dispatchDate": string,
  "mdlNameConsigneeName": string,
  "mineralName": string,
  "vehicleNo": string,
  "dispatchQty": number,
  "productionQty": number,
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

export async function classifyAndExtract(
  base64Image: string,
  mimeType: string = "image/jpeg",
  existingTransitKeys: string[] = []
) {
  const keyPool = getServerKeyPool();
  if (keyPool.length === 0) {
    throw new Error("Server configuration error: Gemini API keys not found in .env.");
  }

  const cleanBase64 = (base64Image || "").replace(/^data:[^;]+;base64,/, "").trim();

  // Try fast single-pass extraction first
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
                { text: UNIVERSAL_SINGLE_PASS_PROMPT },
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

        const detectedType: "transit_duplicate" | "transit_original" | "invoice" | "unknown" =
          parsed.detectedDocType || "unknown";
        const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 90;

        if (detectedType === "unknown" || parsed.isWrongDocument || confidence < 30) {
          return {
            success: false,
            isWrongDocument: true,
            detectedType: "unknown" as const,
            classification: {
              documentType: "unknown" as const,
              confidence,
              reason: parsed.rejectionReason || "Unable to identify this document as an AP Mines form or invoice.",
            },
            rejectionReason:
              parsed.rejectionReason || "Unable to identify this document. Please upload an AP Mines Transit Form or Tax Invoice.",
          };
        }

        // Branch 1: Invoice
        if (detectedType === "invoice") {
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
            success: true,
            isWrongDocument: false,
            detectedType,
            classification: {
              documentType: detectedType,
              confidence,
              reason: "Identified as Tax Invoice",
            },
            data: invoiceData,
            isInvoice: true,
            source: "gemini-vision-singlepass",
          };
        }

        // Branch 2: Transit Form (Duplicate or Original)
        const isOriginal = detectedType === "transit_original";
        const qtyVal = parsed.dispatchQty !== null && parsed.dispatchQty !== undefined
          ? Number(parsed.dispatchQty)
          : (parsed.productionQty !== null && parsed.productionQty !== undefined ? Number(parsed.productionQty) : null);

        const transitData: TransitRecord = {
          stationaryNo: (parsed.stationaryNo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
          docType: detectedType,
          dispatchDate: normalizeDate(parsed.dispatchDate),
          mdlNameConsigneeName: parsed.mdlNameConsigneeName || "",
          mineralName: normalizeMineralGrade(parsed.mineralName),
          vehicleNo: (parsed.vehicleNo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
          dispatchQty: qtyVal,
          productionQty: isOriginal ? qtyVal : null,
        };

        const validation = validateTransitRecord(transitData, existingTransitKeys);

        return {
          success: true,
          isWrongDocument: false,
          detectedType,
          classification: {
            documentType: detectedType,
            confidence,
            reason: `Identified as ${isOriginal ? "Transit Pass (Original)" : "Transit Form (Duplicate)"}`,
          },
          data: transitData,
          validation,
          isInvoice: false,
          source: "gemini-vision-singlepass",
        };
      } catch (err: any) {
        console.warn(`[Universal Single-Pass] Model ${modelName} failed on key index ${i}:`, err.message?.slice(0, 100));
      }
    }
  }

  throw new Error("Universal document processing failed. Please ensure image is well-lit and legible.");
}
