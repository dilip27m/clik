export type DocumentTypeOption = "transit_duplicate" | "transit_original" | "invoice";

// Simplified Transit Record — 6 Core Fields Only (like Tax Invoice's strict 9)
export interface TransitRecord {
  // Primary Key
  stationaryNo: string;
  docType?: DocumentTypeOption;

  // 6 Core Fields
  dispatchDate: string;          // Date only (DD-MM-YYYY), no time
  mdlNameConsigneeName: string;  // Consignee Name
  mineralName: string;           // "Grey Barytes - A" | "Grey Barytes - B" | "Grey Barytes - C and D"
  vehicleNo: string;
  dispatchQty: number | null;    // For Transit Duplicate
  productionQty?: number | null; // For Transit Original

  // Metadata
  imageUrl?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// Tax Invoice — Strict 9 Fields
export interface InvoiceRecord {
  invoiceNo: string;       // PRIMARY KEY
  invoiceDate: string;     // Date only
  billTo: string;
  quantity: number | null;
  ratePerUnit: number | null;
  taxableAmount: number | null;
  cgstAmount: number | null;
  sgstAmount: number | null;
  totalAmount: number | null;
  imageUrl?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// 6 Core Fields for Transit Pass (Duplicate)
export const KEY_FIELDS_DUPLICATE = [
  { key: "stationaryNo", label: "Stationary No (PK)", required: true },
  { key: "dispatchDate", label: "Date", required: true },
  { key: "mdlNameConsigneeName", label: "Consignee Name", required: true },
  { key: "mineralName", label: "Mineral Grade (A, B, C & D)", required: true },
  { key: "vehicleNo", label: "Vehicle Number", required: true },
  { key: "dispatchQty", label: "Dispatch Qty (MT)", required: true },
] as const;

// 6 Core Fields for Transit Pass (Original)
export const KEY_FIELDS_ORIGINAL = [
  { key: "stationaryNo", label: "Stationary No (PK)", required: true },
  { key: "dispatchDate", label: "Date", required: true },
  { key: "mdlNameConsigneeName", label: "Consignee Name", required: true },
  { key: "mineralName", label: "Mineral Grade (A, B, C & D)", required: true },
  { key: "vehicleNo", label: "Vehicle Number", required: true },
  { key: "productionQty", label: "Production Qty (MT)", required: true },
] as const;

// Invoice strict 9 fields metadata
export const INVOICE_STRICT_9_FIELDS = [
  { key: "invoiceNo", label: "1. Invoice No (Primary Key)", type: "string", required: true },
  { key: "invoiceDate", label: "2. Invoice Date", type: "string", required: true },
  { key: "billTo", label: "3. Bill To (Buyer / Consignee)", type: "string", required: true },
  { key: "quantity", label: "4. Quantity (MT)", type: "number", required: true },
  { key: "ratePerUnit", label: "5. Price / Unit (Rate ₹)", type: "number", required: true },
  { key: "taxableAmount", label: "6. Taxable Amount (₹)", type: "number", required: true },
  { key: "cgstAmount", label: "7. CGST Amount (₹)", type: "number", required: true },
  { key: "sgstAmount", label: "8. SGST Amount (₹)", type: "number", required: true },
  { key: "totalAmount", label: "9. Total Invoice Amount (₹)", type: "number", required: true },
] as const;

// Allowed Mineral Grade options: A, B, C & D (C and D combined)
export const MINERAL_GRADE_OPTIONS = [
  { id: "A", label: "Grade A", fullName: "Grey Barytes - A" },
  { id: "B", label: "Grade B", fullName: "Grey Barytes - B" },
  { id: "C & D", label: "Grade C & D", fullName: "Grey Barytes - C and D" },
] as const;

export interface ValidationReport {
  isValid: boolean;
  warnings: string[];
  fieldErrors: Partial<Record<keyof TransitRecord, string>> & Partial<Record<string, string>>;
}

export interface MasterLogFilters {
  search?: string;
  month?: string; // "YYYY-MM"
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string; // "YYYY-MM-DD"
  company?: string;
  grade?: string; // "A", "B", "C & D"
}

export interface GoogleDriveSyncConfig {
  enabled: boolean;
  webhookUrl?: string;
  spreadsheetId?: string;
  sheetName?: string;
}

// Simplified field metadata — 6 core fields only
export const TRANSIT_FIELD_METADATA: {
  key: keyof TransitRecord;
  label: string;
  type: 'string' | 'number' | 'date';
  required: boolean;
}[] = [
  { key: 'stationaryNo', label: 'Stationary No (Primary Key)', type: 'string', required: true },
  { key: 'dispatchDate', label: 'Dispatch Date', type: 'date', required: true },
  { key: 'mdlNameConsigneeName', label: 'Consignee Name', type: 'string', required: true },
  { key: 'mineralName', label: 'Mineral Grade (A, B, C & D)', type: 'string', required: true },
  { key: 'vehicleNo', label: 'Vehicle No', type: 'string', required: true },
  { key: 'dispatchQty', label: 'Dispatch Qty (MT)', type: 'number', required: true },
  { key: 'productionQty', label: 'Production Qty (MT)', type: 'number', required: false },
];
