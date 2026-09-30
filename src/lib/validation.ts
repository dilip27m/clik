import { TransitRecord, InvoiceRecord, ValidationReport } from "@/types/transit";

// =================== DATE NORMALIZATION ===================

/**
 * Normalize any date string to consistent DD-MM-YYYY format.
 * Handles: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD, DD.MM.YYYY
 * Strips any time portion (e.g. "24-09-2026 10:30" → "24-09-2026")
 */
export function normalizeDate(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip any time portion after space
  const s = raw.trim().split(/[\sT]/)[0];

  // YYYY-MM-DD or YYYY/MM/DD → DD-MM-YYYY
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split(/[-/]/);
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }

  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY → DD-MM-YYYY
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(s)) {
    const [d, m, y] = s.split(/[-/.]/);
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }

  return s; // return as-is if format unrecognized
}

/**
 * Convert DD-MM-YYYY to YYYY-MM-DD for DB comparisons and sorting.
 */
export function dateToComparable(raw?: string | null): string {
  if (!raw) return "";
  const normalized = normalizeDate(raw);
  // DD-MM-YYYY → YYYY-MM-DD
  const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return raw.trim();
}

// =================== TRANSIT RECORD VALIDATION ===================

export function validateTransitRecord(
  record: Partial<TransitRecord>,
  existingKeys: string[] = []
): ValidationReport {
  const warnings: string[] = [];
  const fieldErrors: Partial<Record<keyof TransitRecord, string>> = {};

  // 1. Primary Key: stationaryNo
  const stationary = record.stationaryNo?.trim();
  if (!stationary) {
    fieldErrors.stationaryNo = "Stationary No is required as the Primary Key";
  } else {
    if (!/^[A-Z0-9]{6,15}$/i.test(stationary.replace(/\s+/g, ""))) {
      warnings.push(`Stationary No "${stationary}" might have atypical formatting.`);
    }
    if (existingKeys.includes(stationary.toUpperCase())) {
      fieldErrors.stationaryNo = `Duplicate record! Stationary No "${stationary}" is already saved in the database.`;
    }
  }

  // 2. Dispatch Date
  if (!record.dispatchDate?.trim()) {
    fieldErrors.dispatchDate = "Dispatch Date is required";
  }

  // 3. Consignee Name
  if (!record.mdlNameConsigneeName?.trim()) {
    fieldErrors.mdlNameConsigneeName = "Consignee Name is required";
  }

  // 4. Mineral Name / Grade
  if (!record.mineralName?.trim()) {
    fieldErrors.mineralName = "Mineral Name / Grade is required";
  }

  // 5. Vehicle Number validation
  const vehicle = record.vehicleNo?.trim().replace(/[\s-]+/g, "").toUpperCase();
  if (!vehicle) {
    fieldErrors.vehicleNo = "Vehicle No is required";
  } else {
    const vehicleRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;
    if (!vehicleRegex.test(vehicle)) {
      warnings.push(`Vehicle No "${record.vehicleNo}" does not strictly match standard Indian format (e.g., AP27UB5157).`);
    }
  }

  // 6. Dispatch / Production Qty
  const qty = record.dispatchQty ?? record.productionQty;
  if (qty === null || qty === undefined || isNaN(Number(qty))) {
    fieldErrors.dispatchQty = "Quantity must be a valid number";
  } else if (Number(qty) <= 0) {
    warnings.push("Quantity should be greater than 0 MT.");
  } else if (Number(qty) > 100) {
    warnings.push(`Unusually high Quantity (${qty} MT). Please verify.`);
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    warnings,
    fieldErrors,
  };
}

// =================== INVOICE VALIDATION ===================

export interface InvoiceValidationReport {
  isValid: boolean;
  warnings: string[];
  fieldErrors: Partial<Record<keyof InvoiceRecord, string>>;
}

export function validateInvoice(
  invoice: Partial<InvoiceRecord>,
  existingKeys: string[] = []
): InvoiceValidationReport {
  const warnings: string[] = [];
  const fieldErrors: Partial<Record<keyof InvoiceRecord, string>> = {};

  // 1. Invoice No (PK)
  const invNo = invoice.invoiceNo?.trim();
  if (!invNo) {
    fieldErrors.invoiceNo = "Invoice No is required as the Primary Key";
  } else if (existingKeys.includes(invNo.toUpperCase())) {
    fieldErrors.invoiceNo = `Duplicate! Invoice No "${invNo}" already exists in database.`;
  }

  // 2. Invoice Date
  if (!invoice.invoiceDate?.trim()) {
    fieldErrors.invoiceDate = "Invoice Date is required";
  }

  // 3. Bill To
  if (!invoice.billTo?.trim()) {
    fieldErrors.billTo = "Bill To (Buyer / Consignee) is required";
  }

  // 4. Quantity
  if (invoice.quantity === null || invoice.quantity === undefined || isNaN(Number(invoice.quantity))) {
    fieldErrors.quantity = "Quantity must be a valid number";
  } else if (Number(invoice.quantity) <= 0) {
    warnings.push("Quantity should be greater than 0 MT.");
  }

  // 5. Rate per Unit
  if (invoice.ratePerUnit === null || invoice.ratePerUnit === undefined || isNaN(Number(invoice.ratePerUnit))) {
    fieldErrors.ratePerUnit = "Rate per Unit must be a valid number";
  } else if (Number(invoice.ratePerUnit) <= 0) {
    warnings.push("Rate per Unit should be greater than ₹0.");
  }

  // 6. Taxable Amount
  if (invoice.taxableAmount === null || invoice.taxableAmount === undefined || isNaN(Number(invoice.taxableAmount))) {
    fieldErrors.taxableAmount = "Taxable Amount must be a valid number";
  } else if (Number(invoice.taxableAmount) < 0) {
    warnings.push("Taxable Amount should not be negative.");
  }

  // 7. CGST
  if (invoice.cgstAmount === null || invoice.cgstAmount === undefined || isNaN(Number(invoice.cgstAmount))) {
    fieldErrors.cgstAmount = "CGST Amount must be a valid number";
  } else if (Number(invoice.cgstAmount) < 0) {
    warnings.push("CGST Amount should not be negative.");
  }

  // 8. SGST
  if (invoice.sgstAmount === null || invoice.sgstAmount === undefined || isNaN(Number(invoice.sgstAmount))) {
    fieldErrors.sgstAmount = "SGST Amount must be a valid number";
  } else if (Number(invoice.sgstAmount) < 0) {
    warnings.push("SGST Amount should not be negative.");
  }

  // 9. Total Amount
  if (invoice.totalAmount === null || invoice.totalAmount === undefined || isNaN(Number(invoice.totalAmount))) {
    fieldErrors.totalAmount = "Total Amount must be a valid number";
  } else if (Number(invoice.totalAmount) <= 0) {
    warnings.push("Total Amount should be greater than ₹0.");
  }

  // Cross-validation: Total ≈ Taxable + CGST + SGST
  if (
    invoice.taxableAmount !== null && invoice.taxableAmount !== undefined &&
    invoice.cgstAmount !== null && invoice.cgstAmount !== undefined &&
    invoice.sgstAmount !== null && invoice.sgstAmount !== undefined &&
    invoice.totalAmount !== null && invoice.totalAmount !== undefined
  ) {
    const expectedTotal = Number(invoice.taxableAmount) + Number(invoice.cgstAmount) + Number(invoice.sgstAmount);
    const actualTotal = Number(invoice.totalAmount);
    const diff = Math.abs(expectedTotal - actualTotal);
    if (diff > 1) {
      warnings.push(
        `Total Amount (₹${actualTotal.toLocaleString("en-IN")}) differs from Taxable + CGST + SGST = ₹${expectedTotal.toLocaleString("en-IN")} by ₹${diff.toFixed(2)}. Please verify.`
      );
    }
  }

  // Cross-validation: Taxable ≈ Quantity × Rate
  if (
    invoice.quantity !== null && invoice.quantity !== undefined &&
    invoice.ratePerUnit !== null && invoice.ratePerUnit !== undefined &&
    invoice.taxableAmount !== null && invoice.taxableAmount !== undefined
  ) {
    const expectedTaxable = Number(invoice.quantity) * Number(invoice.ratePerUnit);
    const actualTaxable = Number(invoice.taxableAmount);
    const diff = Math.abs(expectedTaxable - actualTaxable);
    if (diff > 1) {
      warnings.push(
        `Taxable Amount (₹${actualTaxable.toLocaleString("en-IN")}) differs from Qty × Rate = ₹${expectedTaxable.toLocaleString("en-IN")} by ₹${diff.toFixed(2)}. Please verify.`
      );
    }
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    warnings,
    fieldErrors,
  };
}

// =================== NORMALIZERS ===================

export function normalizeVehicleNo(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function normalizeStationaryNo(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
