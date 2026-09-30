import ExcelJS from "exceljs";
import { TransitRecord, InvoiceRecord } from "@/types/transit";

function styleHeaderRow(headerRow: ExcelJS.Row) {
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF111111" },
    };
    cell.font = {
      name: "Segoe UI",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: "FF333333" } } };
  });
}

function addTransitSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  records: TransitRecord[],
  isOriginal: boolean
) {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // 6 Core Columns
  ws.columns = [
    { header: "Stationary No (PK)", key: "stationaryNo", width: 22 },
    { header: "Date", key: "dispatchDate", width: 16 },
    { header: "Consignee Name", key: "mdlNameConsigneeName", width: 34 },
    { header: "Mineral Grade", key: "mineralName", width: 26 },
    { header: "Vehicle Number", key: "vehicleNo", width: 20 },
    {
      header: isOriginal ? "Production Qty (MT)" : "Dispatch Qty (MT)",
      key: "qty",
      width: 22,
    },
  ];

  styleHeaderRow(ws.getRow(1));

  records.forEach((record, index) => {
    const qtyVal = isOriginal
      ? record.productionQty ?? record.dispatchQty
      : record.dispatchQty ?? record.productionQty;

    const row = ws.addRow({
      stationaryNo: record.stationaryNo,
      dispatchDate: record.dispatchDate,
      mdlNameConsigneeName: record.mdlNameConsigneeName,
      mineralName: record.mineralName,
      vehicleNo: record.vehicleNo,
      qty: qtyVal !== null && qtyVal !== undefined ? Number(qtyVal) : "",
    });

    row.height = 24;
    const isEven = index % 2 === 0;
    const bgArgb = isEven ? "FFFFFFFF" : "FFF9FAFB";

    row.eachCell((cell, colNumber) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
      cell.font = { name: "Segoe UI", size: 10, color: { argb: "FF18181B" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 6 ? "right" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE4E4E7" } },
        bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
        left: { style: "thin", color: { argb: "FFF4F4F5" } },
        right: { style: "thin", color: { argb: "FFF4F4F5" } },
      };

      if (colNumber === 6) {
        cell.numFmt = "0.00";
      }
    });
  });
}

function addInvoiceSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  invoices: InvoiceRecord[]
) {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Strict 9 Fields
  ws.columns = [
    { header: "Invoice No (PK)", key: "invoiceNo", width: 22 },
    { header: "Invoice Date", key: "invoiceDate", width: 16 },
    { header: "Bill To (Buyer)", key: "billTo", width: 38 },
    { header: "Quantity (MT)", key: "quantity", width: 18 },
    { header: "Rate (Rs)", key: "ratePerUnit", width: 18 },
    { header: "Taxable Amount (Rs)", key: "taxableAmount", width: 22 },
    { header: "CGST (Rs)", key: "cgstAmount", width: 18 },
    { header: "SGST (Rs)", key: "sgstAmount", width: 18 },
    { header: "Total Amount (Rs)", key: "totalAmount", width: 24 },
  ];

  styleHeaderRow(ws.getRow(1));

  invoices.forEach((inv, index) => {
    const row = ws.addRow({
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      billTo: inv.billTo,
      quantity: inv.quantity !== null && inv.quantity !== undefined ? Number(inv.quantity) : "",
      ratePerUnit: inv.ratePerUnit !== null && inv.ratePerUnit !== undefined ? Number(inv.ratePerUnit) : "",
      taxableAmount: inv.taxableAmount !== null && inv.taxableAmount !== undefined ? Number(inv.taxableAmount) : "",
      cgstAmount: inv.cgstAmount !== null && inv.cgstAmount !== undefined ? Number(inv.cgstAmount) : "",
      sgstAmount: inv.sgstAmount !== null && inv.sgstAmount !== undefined ? Number(inv.sgstAmount) : "",
      totalAmount: inv.totalAmount !== null && inv.totalAmount !== undefined ? Number(inv.totalAmount) : "",
    });

    row.height = 24;
    const isEven = index % 2 === 0;
    const bgArgb = isEven ? "FFFFFFFF" : "FFF9FAFB";

    row.eachCell((cell, colNumber) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
      cell.font = { name: "Segoe UI", size: 10, color: { argb: "FF18181B" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: [4, 5, 6, 7, 8, 9].includes(colNumber) ? "right" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE4E4E7" } },
        bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
        left: { style: "thin", color: { argb: "FFF4F4F5" } },
        right: { style: "thin", color: { argb: "FFF4F4F5" } },
      };

      if ([4, 5, 6, 7, 8, 9].includes(colNumber)) {
        cell.numFmt = "#,##0.00";
      }
    });
  });
}

export async function generateTransitExcel(
  records: TransitRecord[],
  docType: string = "transit_duplicate"
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AP Mines Portal";
  workbook.created = new Date();

  const isOriginal = docType.includes("original");
  const sheetName = isOriginal ? "Transit Original" : "Transit Duplicate";

  addTransitSheet(workbook, sheetName, records, isOriginal);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateInvoiceExcel(invoices: InvoiceRecord[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AP Mines Portal";
  workbook.created = new Date();

  addInvoiceSheet(workbook, "Tax Invoices", invoices);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateCombinedMasterExcel(data: {
  duplicateRecords: TransitRecord[];
  originalRecords: TransitRecord[];
  invoices: InvoiceRecord[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AP Mines Portal";
  workbook.created = new Date();

  // Tab 1: Transit Duplicate
  addTransitSheet(workbook, "Transit Duplicate", data.duplicateRecords, false);

  // Tab 2: Transit Original
  addTransitSheet(workbook, "Transit Original", data.originalRecords, true);

  // Tab 3: Tax Invoices
  addInvoiceSheet(workbook, "Tax Invoices", data.invoices);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
