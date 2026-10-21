import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { BILL_TYPES, BillData, BillType, Check, checkBill, cleanBillData, isBillType } from "./bill-types";
import { companyFromName } from "./companies";
import { availableModels, creditsLeft, markModelExhausted, recordModelUse } from "./quota";

const PROMPT = `You read photos of business bills for two barytes companies in Andhra Pradesh:
"Sri Lalithha Pulverisers" and "Renuka Minerals". Either company can be "our side" of a bill.
The photo is one of exactly 4 bill types. First decide which, then read its fields exactly as printed.

TYPE "transit_in" — Government of AP "TRANSIT FORM (Duplicate)", OMMS 2.0, beige security paper.
  stationaryNo: "DD" + 7 digits (e.g. "DD3111239"). It is printed in 3 places: the big number top-right (often half-hidden by the QR code),
    the small "Stationary No:" line (often overprinted by the title), and inside the faint diagonal watermark text ("Stationary No: DD…").
    Read all 3 and give the number they agree on. If they disagree, add stationaryNo to "unsure".
  date: "Date & Time of Dispatch" — date part only.
  lesseeName: "Lessee Name" (usually "M/s APMDC Limited").
  consigneeName: "Mdl Name/Consignee Name" (e.g. "Sri Lalitha Pulverisers").
  mineral: "Mineral Name" (e.g. "Grey Barytes - C and D").
  vehicleNo: "Vehicle No".
  qty: "Dispatch Qty" as a number (17.7 MT → 17.7).
  transitFormNo: "Transit Form No" (e.g. "83TSTA1219-4U3").

TYPE "apmdc_invoice" — "GST INVOICE" from "The A. P. Mineral Development Corporation Limited" (APMDC).
  invoiceNo: "Invoice No." (e.g. "PSI/26-27/72208"). NOT the DO No, NOT the IRN.
  date: "Date Of Invoice". Ignore the "Dt:" next to DO No.
  item: "Description of Goods" (e.g. "C+D+W Barytes Ore").
  qty: the "Qty" column number.
  taxable: "Taxable Value". cgst: CGST amount. sgst: SGST amount. total: "Invoice Value".
  vehicleNo: "Veh.No".

TYPE "form_e" — Government of AP "FORM E", "TRANSIT PASS (Original)", blue-bordered paper.
  stationaryNo: "MDLB" + 7 digits (e.g. "MDLB0467135"), from "Stationary No:" and the big number top-right.
  date: "Date & Time of Dispatch" — date part only.
  consigneeName: "Consignee Name" (the buyer). NOT "Company Name" (that is the seller).
  mineral: "Mineral Name".
  vehicleNo: "Vehicle Registration No".
  qty: number from "Dispatched Quantity" (e.g. "37.5 PRODUCTION QUANTITY (MT)" → 37.5).
  saleValue: "Sale Value".

TYPE "sales_invoice" — "Tax Invoice" whose seller heading is our company (e.g. "SRI LALITHHA PULVERISERS" or "RENUKA MINERALS").
  invoiceNo: "Invoice No." (e.g. "2026-27/28").
  date: "Date" under Invoice Details.
  billTo: the company name on the first line under "Bill To".
  item: "Item name" (e.g. "BARYTES POWDER 3.96", "Being Crushing Charges for Barytes powder").
  qty: "Quantity". rate: "Price/Unit". taxable: "Taxable amount".
  cgst: CGST amount. sgst: SGST amount. total: the final "Total" (after round off).

OUR COMPANY — set "ourCompany" to the name of our side of the bill, exactly as printed:
  transit_in: the "Mdl Name/Consignee Name".   apmdc_invoice: the receiver name under "Details of Receiver (Billed to)".
  form_e: the "Company Name".                   sales_invoice: the seller name in the big heading at the top.

PHOTO QUALITY — set "photoQuality":
  "clear"    the important numbers are easy to read
  "blurry"   out of focus or shaken; numbers are hard to read
  "cut_off"  part of the bill is outside the photo
  "dark"     too dark or strong glare/shadow over the numbers

RULES
- Dates: write as DD-MM-YYYY exactly as printed.
- Numbers: plain numbers without ₹ or commas. Indian commas: "10,78,650.00" → 1078650.
- Use null for anything not printed or not readable. Never guess.
- Put the key of every field you are unsure about (blurred, covered, smudged) in "unsure".
- If the photo is none of these 4 bills, set type to "unknown".`;

const FIELD_KEYS = Array.from(new Set(Object.values(BILL_TYPES).flatMap((d) => d.fields.map((f) => f.key))));

// Every key is required (null when absent) so the model can't invent its own
// key names like "quantity" or "invoiceDate".
const SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["transit_in", "apmdc_invoice", "form_e", "sales_invoice", "unknown"] },
    photoQuality: { type: "string", enum: ["clear", "blurry", "cut_off", "dark"] },
    ourCompany: { type: ["string", "null"] },
    ...Object.fromEntries(FIELD_KEYS.map((k) => [k, { type: ["string", "number", "null"] }])),
    unsure: { type: "array", items: { type: "string" } },
  },
  required: ["type", "photoQuality", "ourCompany", ...FIELD_KEYS, "unsure"],
  additionalProperties: false,
};

const TIMEOUT_MS = 30000;

const KEY_FORMATS: Partial<Record<BillType, RegExp>> = {
  transit_in: /^DD\d{7}$/,
  form_e: /^MDL[A-Z]\d{7}$/,
};

const RETAKE_MESSAGES: Record<string, string> = {
  blurry: "The photo is blurry. Please hold the phone steady and take it again.",
  cut_off: "Part of the bill is cut off. Please fit the whole bill in the photo.",
  dark: "The photo is too dark or has glare. Please take it again in good light.",
};

export interface Extracted {
  type: BillType;
  company: string | null; // detected from the name on the bill
  data: BillData;
  unsure: string[];
  checks: Check[];
}

export type ExtractResult =
  | ({ ok: true } & Extracted)
  // retake: photo too poor to trust. `draft` holds what could be read, so the
  // user may still continue without spending another scan.
  | { ok: false; reason: string; retake?: boolean; draft?: Extracted; outOfCredits?: boolean; resetsAt?: string };

function apiKeys(): string[] {
  const raw = [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY].filter(Boolean).join(",");
  return Array.from(new Set(raw.split(",").map((k) => k.trim()).filter(Boolean)));
}

async function callModel(apiKey: string, model: string, imageBase64: string, mimeType: string) {
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: PROMPT }, { inlineData: { data: imageBase64, mimeType } }] }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
      temperature: 0,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    },
  });
  return JSON.parse(res.text || "{}");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function interpret(parsed: any): ExtractResult {
  if (!isBillType(parsed.type)) {
    return { ok: false, retake: true, reason: "This doesn't look like one of the 4 bills. Please take a photo of the whole bill." };
  }
  const type: BillType = parsed.type;
  const def = BILL_TYPES[type];
  const data = cleanBillData(type, parsed);
  const fieldKeys = new Set(def.fields.map((f) => f.key));
  const unsure = new Set<string>((Array.isArray(parsed.unsure) ? parsed.unsure : []).filter((k: string) => fieldKeys.has(k)));
  const checks = checkBill(type, data);
  const format = KEY_FORMATS[type];
  if (format && data[def.keyField] && !format.test(String(data[def.keyField]))) {
    unsure.add(def.keyField);
    checks.push({ field: def.keyField, level: "warn", message: "This number doesn't look complete — please check it" });
  }
  const extracted: Extracted = { type, company: companyFromName(parsed.ourCompany), data, unsure: [...unsure], checks };

  const missing = checks.filter((c) => c.level === "error").length;
  const quality = String(parsed.photoQuality || "clear");
  if (quality !== "clear" || missing >= 3 || unsure.size >= 3) {
    return {
      ok: false,
      retake: true,
      reason: RETAKE_MESSAGES[quality] || "Some numbers could not be read. Please take the photo again, closer and steady.",
      draft: extracted,
    };
  }
  return { ok: true, ...extracted };
}

// One scan = normally one request. Models are tried in order; a model whose
// free daily quota is used up is skipped until the quota resets.
export async function extractBill(imageBase64: string, mimeType = "image/jpeg"): Promise<ExtractResult> {
  const keys = apiKeys();
  if (!keys.length) return { ok: false, reason: "The AI key is not set up on the server." };

  const models = await availableModels();
  if (!models.length) {
    const credits = await creditsLeft();
    return { ok: false, outOfCredits: true, resetsAt: credits.resetsAt, reason: "Today's free scans are used up." };
  }

  let busy = false;
  for (const model of models) {
    // A per-minute 429 is per key, so one more key may still work.
    for (const apiKey of keys.sort(() => Math.random() - 0.5).slice(0, 2)) {
      try {
        const parsed = await callModel(apiKey, model, imageBase64, mimeType);
        await recordModelUse(model);
        return interpret(parsed);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[extract] ${model} failed:`, msg.slice(0, 140));
        if (/PerDay/.test(msg)) {
          await markModelExhausted(model);
          break;
        }
        if (/429|RESOURCE_EXHAUSTED/.test(msg)) continue;
        busy = true;
        break; // busy or timed out: move to the next model
      }
    }
  }

  const credits = await creditsLeft();
  if (credits.left === 0) {
    return { ok: false, outOfCredits: true, resetsAt: credits.resetsAt, reason: "Today's free scans are used up." };
  }
  return {
    ok: false,
    reason: busy
      ? "Google's reader is busy right now. Please wait a minute and try again."
      : "Could not read the bill. Please check the internet and try again.",
  };
}
