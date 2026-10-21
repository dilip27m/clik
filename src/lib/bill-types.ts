// Single source of truth for the 4 bill types: which fields each one has,
// how they are labelled, and which field is the bill's unique number.
// Field lists follow the fields marked by hand on the sample bills.

export type BillType = "transit_in" | "apmdc_invoice" | "form_e" | "sales_invoice";

export type FieldKind = "text" | "date" | "qty" | "money" | "grade" | "vehicle";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
}

export interface BillTypeDef {
  type: BillType;
  name: string;          // short name shown everywhere
  fullName: string;      // printed title on the paper bill
  hint: string;          // one line explaining what this bill is
  direction: "in" | "out";
  sheetTab: string;      // Google Sheet tab name
  keyField: string;      // unique bill number
  partyField: string;    // who the other side is
  amountField?: string;  // main rupee amount, if any
  fields: FieldDef[];
}

export const GRADE_OPTIONS = ["Grey Barytes - A", "Grey Barytes - B", "Grey Barytes - C and D"] as const;

export const BILL_TYPES: Record<BillType, BillTypeDef> = {
  transit_in: {
    type: "transit_in",
    name: "Transit Form",
    fullName: "Transit Form (Duplicate)",
    hint: "Raw ore coming in from APMDC · number starts with DD",
    direction: "in",
    sheetTab: "Transit Forms",
    keyField: "stationaryNo",
    partyField: "consigneeName",
    fields: [
      { key: "stationaryNo", label: "Stationary No", kind: "text", required: true },
      { key: "date", label: "Dispatch Date", kind: "date", required: true },
      { key: "lesseeName", label: "Lessee Name", kind: "text", required: true },
      { key: "consigneeName", label: "Consignee Name", kind: "text", required: true },
      { key: "mineral", label: "Mineral Grade", kind: "grade", required: true },
      { key: "vehicleNo", label: "Vehicle No", kind: "vehicle", required: true },
      { key: "qty", label: "Dispatch Qty (MT)", kind: "qty", required: true },
      { key: "transitFormNo", label: "Transit Form No", kind: "text" },
    ],
  },
  apmdc_invoice: {
    type: "apmdc_invoice",
    name: "APMDC Bill",
    fullName: "APMDC GST Invoice",
    hint: "Purchase bill from APMDC · number like PSI/26-27/72208",
    direction: "in",
    sheetTab: "APMDC Bills",
    keyField: "invoiceNo",
    partyField: "item",
    amountField: "total",
    fields: [
      { key: "invoiceNo", label: "Invoice No", kind: "text", required: true },
      { key: "date", label: "Invoice Date", kind: "date", required: true },
      { key: "item", label: "Item", kind: "text", required: true },
      { key: "qty", label: "Quantity (MT)", kind: "qty", required: true },
      { key: "taxable", label: "Taxable Value", kind: "money", required: true },
      { key: "cgst", label: "CGST", kind: "money", required: true },
      { key: "sgst", label: "SGST", kind: "money", required: true },
      { key: "total", label: "Invoice Value", kind: "money", required: true },
      { key: "vehicleNo", label: "Vehicle No", kind: "vehicle" },
    ],
  },
  form_e: {
    type: "form_e",
    name: "Form E",
    fullName: "Form E Transit Pass (Original)",
    hint: "Powder going out to a buyer · number starts with MDLB",
    direction: "out",
    sheetTab: "Form E",
    keyField: "stationaryNo",
    partyField: "consigneeName",
    amountField: "saleValue",
    fields: [
      { key: "stationaryNo", label: "Stationary No", kind: "text", required: true },
      { key: "date", label: "Dispatch Date", kind: "date", required: true },
      { key: "consigneeName", label: "Consignee (Buyer)", kind: "text", required: true },
      { key: "mineral", label: "Mineral Grade", kind: "grade", required: true },
      { key: "vehicleNo", label: "Vehicle No", kind: "vehicle", required: true },
      { key: "qty", label: "Quantity (MT)", kind: "qty", required: true },
      { key: "saleValue", label: "Sale Value", kind: "money" },
    ],
  },
  sales_invoice: {
    type: "sales_invoice",
    name: "Sales Bill",
    fullName: "Our Tax Invoice",
    hint: "Our own sales bill to a buyer · number like 2026-27/28",
    direction: "out",
    sheetTab: "Sales Bills",
    keyField: "invoiceNo",
    partyField: "billTo",
    amountField: "total",
    fields: [
      { key: "invoiceNo", label: "Invoice No", kind: "text", required: true },
      { key: "date", label: "Invoice Date", kind: "date", required: true },
      { key: "billTo", label: "Bill To", kind: "text", required: true },
      { key: "item", label: "Item", kind: "text" },
      { key: "qty", label: "Quantity", kind: "qty", required: true },
      { key: "rate", label: "Price / Unit", kind: "money", required: true },
      { key: "taxable", label: "Taxable Amount", kind: "money", required: true },
      { key: "cgst", label: "CGST", kind: "money", required: true },
      { key: "sgst", label: "SGST", kind: "money", required: true },
      { key: "total", label: "Total", kind: "money", required: true },
    ],
  },
};

export const BILL_TYPE_ORDER: BillType[] = ["transit_in", "apmdc_invoice", "form_e", "sales_invoice"];

export function isBillType(v: unknown): v is BillType {
  return typeof v === "string" && v in BILL_TYPES;
}

export type BillData = Record<string, string | number | null>;

export interface Bill {
  id: number;
  company: string;
  type: BillType;
  docNo: string;
  date: string;          // YYYY-MM-DD
  party: string;
  vehicleNo: string;
  qty: number | null;
  amount: number | null;
  data: BillData;
  hasPhoto: boolean;
  photoUrl: string | null; // Google Drive link once uploaded
  sheetStatus: "pending" | "synced" | "failed";
  timings: Timings;
  createdAt: string;
}

// How long each step took for one bill (milliseconds).
export interface Timings {
  prepareMs?: number; // shrink + blur check on the phone
  uploadMs?: number;  // photo travelling to the server and the answer back
  aiMs?: number;      // Gemini reading the bill
  reviewMs?: number;  // the person checking the values
  dbMs?: number;      // saving in the database (Neon)
  sheetMs?: number;   // Google Sheet row + photo into Drive
  manual?: boolean;   // typed in by hand, no AI
}

export interface Check {
  field?: string;
  level: "warn" | "error";
  message: string;
}

// ── Value cleaning (shared by AI output and manual edits) ──

export function cleanCode(v: unknown): string {
  return String(v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function cleanNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[₹,\s]|MT|MTS/gi, ""));
  return Number.isFinite(n) ? n : null;
}

// Accepts DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD; returns YYYY-MM-DD or "".
export function cleanDate(v: unknown): string {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

export function cleanGrade(v: unknown): string {
  const t = String(v ?? "").toUpperCase();
  if (!t.trim()) return "";
  if (/\bC\s*(&|AND|\+)\s*D\b/.test(t)) return "Grey Barytes - C and D";
  const s = t.replace(/\b(AND|BARYTES|GREY|GRADE|PRODUCTION|QTY)\b/g, " ");
  if (/\bA\b/.test(s) && !/\b[BCD]\b/.test(s)) return "Grey Barytes - A";
  if (/\bB\b/.test(s) && !/\b[ACD]\b/.test(s)) return "Grey Barytes - B";
  return "Grey Barytes - C and D";
}

export function cleanField(kind: FieldKind, v: unknown): string | number | null {
  switch (kind) {
    case "qty":
    case "money":
      return cleanNumber(v);
    case "date":
      return cleanDate(v);
    case "vehicle":
      return cleanCode(v);
    case "grade":
      return cleanGrade(v);
    default:
      return String(v ?? "").replace(/\s+/g, " ").trim();
  }
}

export function cleanBillData(type: BillType, raw: Record<string, unknown>): BillData {
  const def = BILL_TYPES[type];
  const out: BillData = {};
  for (const f of def.fields) out[f.key] = cleanField(f.kind, raw[f.key]);
  // Stationary numbers have no spaces ("DD 3112307" → "DD3112307")
  if (def.keyField === "stationaryNo") out.stationaryNo = cleanCode(out.stationaryNo);
  return out;
}

// Sanity checks so misread numbers get highlighted before saving.
export function checkBill(type: BillType, d: BillData): Check[] {
  const def = BILL_TYPES[type];
  const checks: Check[] = [];
  for (const f of def.fields) {
    const v = d[f.key];
    if (f.required && (v === null || v === "")) {
      checks.push({ field: f.key, level: "error", message: `${f.label} is missing` });
    }
  }
  const n = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

  for (const f of def.fields) {
    const v = d[f.key];
    if (f.kind === "vehicle" && v && !/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(String(v))) {
      checks.push({ field: f.key, level: "warn", message: "Vehicle number doesn't look right — please check" });
    }
  }
  const qty = n("qty");
  if (qty !== null && (qty <= 0 || qty > 1000)) {
    checks.push({ field: "qty", level: "warn", message: "Quantity looks unusual — please check" });
  }
  const taxable = n("taxable"), cgst = n("cgst"), sgst = n("sgst"), total = n("total"), rate = n("rate");
  if (cgst !== null && sgst !== null && !near(cgst, sgst, 1)) {
    checks.push({ field: "sgst", level: "warn", message: "CGST and SGST should be the same" });
  }
  if (taxable !== null && cgst !== null && sgst !== null && total !== null && !near(taxable + cgst + sgst, total)) {
    checks.push({ field: "total", level: "warn", message: "Taxable + CGST + SGST does not equal the total" });
  }
  if (type === "sales_invoice" && qty !== null && rate !== null && taxable !== null && !near(qty * rate, taxable, 5)) {
    checks.push({ field: "taxable", level: "warn", message: "Quantity × price does not equal the taxable amount" });
  }
  const date = String(d.date || "");
  if (date) {
    const t = new Date(date).getTime();
    if (t > Date.now() + 86400000) checks.push({ field: "date", level: "warn", message: "Date is in the future" });
    else if (t < Date.now() - 300 * 86400000) checks.push({ field: "date", level: "warn", message: "Date is almost a year old — please check the year" });
  }
  return checks;
}

export function summarize(type: BillType, d: BillData) {
  const def = BILL_TYPES[type];
  return {
    docNo: String(d[def.keyField] ?? ""),
    date: String(d.date ?? ""),
    party: String(d[def.partyField] ?? ""),
    vehicleNo: String(d.vehicleNo ?? ""),
    qty: typeof d.qty === "number" ? d.qty : null,
    amount: def.amountField && typeof d[def.amountField] === "number" ? (d[def.amountField] as number) : null,
  };
}

// ── Display helpers ──

export function formatINR(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatQty(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: 3 }) + " MT";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string | null | undefined): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatMonth(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})/);
  if (!m) return ym;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
