import { TransitRecord, InvoiceRecord, GoogleDriveSyncConfig, DocumentTypeOption } from "@/types/transit";

export const GOOGLE_APPS_SCRIPT_CODE = `// ====================================================================
// AP MINES PORTAL — GOOGLE APPS SCRIPT FOR GOOGLE SHEETS LIVE SYNC
// Supports 3 Dedicated Tabs: Transit Duplicate, Transit Original, Tax Invoices
// ====================================================================

// RUN THIS FUNCTION ONCE to wipe all old legacy columns (driver name, destination,
// permit no, transit form no, sync timestamp) and reset all 3 sheets fresh!
function resetCleanAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Reset 'Transit Duplicate' — STRICT 6 Columns Only
  var s1 = ss.getSheetByName("Transit Duplicate");
  if (!s1) {
    s1 = ss.insertSheet("Transit Duplicate");
  } else {
    s1.clear(); // Wipes all old legacy columns & data
  }
  s1.appendRow([
    "Stationary No (PK)", "Date", "Consignee Name", "Mineral Grade",
    "Vehicle No", "Dispatch Qty (MT)"
  ]);
  var h1 = s1.getRange(1, 1, 1, 6);
  h1.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
  s1.setFrozenRows(1);

  // 2. Reset 'Transit Original' — STRICT 6 Columns Only
  var s2 = ss.getSheetByName("Transit Original");
  if (!s2) {
    s2 = ss.insertSheet("Transit Original");
  } else {
    s2.clear(); // Wipes all old legacy columns & data
  }
  s2.appendRow([
    "Stationary No (PK)", "Date", "Consignee Name", "Mineral Grade",
    "Vehicle No", "Production Qty (MT)"
  ]);
  var h2 = s2.getRange(1, 1, 1, 6);
  h2.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
  s2.setFrozenRows(1);

  // 3. Reset 'Tax Invoices' — STRICT 9 Columns Only
  var s3 = ss.getSheetByName("Tax Invoices");
  if (!s3) {
    s3 = ss.insertSheet("Tax Invoices");
  } else {
    s3.clear(); // Wipes all old legacy columns & data
  }
  s3.appendRow([
    "Invoice No (PK)", "Invoice Date", "Bill To (Buyer)", 
    "Quantity (MT)", "Rate (Rs)", "Taxable Amount (Rs)", 
    "CGST (Rs)", "SGST (Rs)", "Total Amount (Rs)"
  ]);
  var h3 = s3.getRange(1, 1, 1, 9);
  h3.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
  s3.setFrozenRows(1);

  return "All 3 sheets successfully wiped and formatted with clean headers!";
}

// Automatically creates missing sheets without overwriting existing data
function setupAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Tab 1: Transit Duplicate
  var s1 = ss.getSheetByName("Transit Duplicate") || ss.insertSheet("Transit Duplicate");
  if (s1.getLastRow() === 0) {
    s1.appendRow([
      "Stationary No (PK)", "Date", "Consignee Name", "Mineral Grade",
      "Vehicle No", "Dispatch Qty (MT)"
    ]);
    var h1 = s1.getRange(1, 1, 1, 6);
    h1.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
    s1.setFrozenRows(1);
  }

  // Tab 2: Transit Original
  var s2 = ss.getSheetByName("Transit Original") || ss.insertSheet("Transit Original");
  if (s2.getLastRow() === 0) {
    s2.appendRow([
      "Stationary No (PK)", "Date", "Consignee Name", "Mineral Grade",
      "Vehicle No", "Production Qty (MT)"
    ]);
    var h2 = s2.getRange(1, 1, 1, 6);
    h2.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
    s2.setFrozenRows(1);
  }

  // Tab 3: Tax Invoices
  var s3 = ss.getSheetByName("Tax Invoices") || ss.insertSheet("Tax Invoices");
  if (s3.getLastRow() === 0) {
    s3.appendRow([
      "Invoice No (PK)", "Invoice Date", "Bill To (Buyer)", 
      "Quantity (MT)", "Rate (Rs)", "Taxable Amount (Rs)", 
      "CGST (Rs)", "SGST (Rs)", "Total Amount (Rs)"
    ]);
    var h3 = s3.getRange(1, 1, 1, 9);
    h3.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
    s3.setFrozenRows(1);
  }

  return "All 3 tabs successfully created and initialized!";
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Reset / Wipe Action
    if (data.action === "reset") {
      resetCleanAllSheets();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "All 3 sheets successfully wiped and reset with clean headers."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Handle Test Ping / Setup
    if (data.action === "ping" || data.testOnly || data.action === "setup") {
      setupAllSheets();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Google Drive Live Sync Connected Successfully! All 3 tabs verified and ready."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var docType = data.docType || "transit_duplicate";
    
    // 3. Handle Row Deletion
    if (data.action === "delete") {
      var sheetName = "Transit Duplicate";
      if (docType === "invoice") sheetName = "Tax Invoices";
      else if (docType === "transit_original") sheetName = "Transit Original";
      
      var targetSheet = ss.getSheetByName(sheetName);
      if (!targetSheet) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "Sheet not found: " + sheetName
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      var targetKey = (data.id || data.stationaryNo || data.invoiceNo || "").toString().trim().toUpperCase();
      if (!targetKey) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "No identifier provided for deletion."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      var lastRow = targetSheet.getLastRow();
      var foundAndDeleted = false;
      if (lastRow > 1) {
        var colValues = targetSheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = colValues.length - 1; i >= 0; i--) {
          var cellVal = colValues[i][0] ? colValues[i][0].toString().trim().toUpperCase() : "";
          if (cellVal === targetKey) {
            targetSheet.deleteRow(i + 2);
            foundAndDeleted = true;
            break;
          }
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        deleted: foundAndDeleted,
        message: foundAndDeleted
          ? "Row '" + targetKey + "' deleted from: " + sheetName
          : "Row '" + targetKey + "' not found in: " + sheetName
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. Handle Appending New Records — Strict Fields Only (No Sync Timestamp)
    if (docType === "invoice") {
      var sheet = ss.getSheetByName("Tax Invoices") || ss.insertSheet("Tax Invoices");
      if (sheet.getLastRow() === 0) {
        sheet.appendRow([
          "Invoice No (PK)", "Invoice Date", "Bill To (Buyer)", 
          "Quantity (MT)", "Rate (Rs)", "Taxable Amount (Rs)", 
          "CGST (Rs)", "SGST (Rs)", "Total Amount (Rs)"
        ]);
        var header = sheet.getRange(1, 1, 1, 9);
        header.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      sheet.appendRow([
        data.invoiceNo || "",
        data.invoiceDate || "",
        data.billTo || "",
        data.quantity || 0,
        data.ratePerUnit || 0,
        data.taxableAmount || 0,
        data.cgstAmount || 0,
        data.sgstAmount || 0,
        data.totalAmount || 0
      ]);
    } else if (docType === "transit_original") {
      var sheet = ss.getSheetByName("Transit Original") || ss.insertSheet("Transit Original");
      if (sheet.getLastRow() === 0) {
        sheet.appendRow([
          "Stationary No (PK)", "Date", "Consignee Name", "Mineral Grade",
          "Vehicle No", "Production Qty (MT)"
        ]);
        var header = sheet.getRange(1, 1, 1, 6);
        header.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      sheet.appendRow([
        data.stationaryNo || "",
        data.date || "",
        data.consigneeName || "",
        data.mineralName || "",
        data.vehicleNo || "",
        data.productionQty || data.dispatchQty || 0
      ]);
    } else {
      var sheet = ss.getSheetByName("Transit Duplicate") || ss.insertSheet("Transit Duplicate");
      if (sheet.getLastRow() === 0) {
        sheet.appendRow([
          "Stationary No (PK)", "Date", "Consignee Name", "Mineral Grade",
          "Vehicle No", "Dispatch Qty (MT)"
        ]);
        var header = sheet.getRange(1, 1, 1, 6);
        header.setBackground("#111111").setFontColor("#FFFFFF").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }
      sheet.appendRow([
        data.stationaryNo || "",
        data.date || "",
        data.consigneeName || "",
        data.mineralName || "",
        data.vehicleNo || "",
        data.dispatchQty || 0
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Row appended successfully to " + docType
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

/**
 * Live sync helper for Google Drive / Google Sheets — 6 Core Fields Only
 */
export async function syncRecordToGoogleDrive(
  options: {
    record?: TransitRecord;
    invoice?: InvoiceRecord;
    docType?: DocumentTypeOption;
    testOnly?: boolean;
  },
  config: GoogleDriveSyncConfig
): Promise<{ success: boolean; message: string }> {
  if (!config.enabled) {
    return { success: false, message: "Google Drive sync is disabled." };
  }

  if (!config.webhookUrl) {
    return { success: false, message: "No Google Drive Webhook URL configured." };
  }

  try {
    let payload: any = {
      timestamp: new Date().toISOString(),
      testOnly: options.testOnly || false,
    };

    if (options.testOnly) {
      payload.action = "ping";
    } else if (options.invoice || options.docType === "invoice") {
      const inv = options.invoice!;
      payload = {
        ...payload,
        docType: "invoice",
        action: "append_invoice",
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        billTo: inv.billTo,
        quantity: inv.quantity,
        ratePerUnit: inv.ratePerUnit,
        taxableAmount: inv.taxableAmount,
        cgstAmount: inv.cgstAmount,
        sgstAmount: inv.sgstAmount,
        totalAmount: inv.totalAmount,
      };
    } else if (options.record) {
      const rec = options.record;
      const isOriginal = options.docType === "transit_original" || rec.docType === "transit_original";
      payload = {
        ...payload,
        docType: isOriginal ? "transit_original" : "transit_duplicate",
        action: "append_transit_record",
        stationaryNo: rec.stationaryNo,
        date: rec.dispatchDate,
        consigneeName: rec.mdlNameConsigneeName,
        mineralName: rec.mineralName,
        vehicleNo: rec.vehicleNo,
        dispatchQty: rec.dispatchQty,
        productionQty: rec.productionQty ?? null,
      };
    }

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });

    if (response.ok) {
      try {
        const data = await response.json();
        if (data && data.success === false) {
          return {
            success: false,
            message: data.error || data.message || "Google Sheets returned an error.",
          };
        }
        return {
          success: true,
          message: data.message || "Live synchronized with Google Drive Sheet!",
        };
      } catch {
        return { success: true, message: "Live synchronized with Google Drive Sheet!" };
      }
    } else {
      const errText = await response.text();
      return {
        success: false,
        message: `Google Drive response error (${response.status}): ${errText.slice(0, 100)}`,
      };
    }
  } catch (error: any) {
    console.error("[Google Drive Sync Error]:", error);
    return {
      success: false,
      message: error.message || "Failed to reach Google Drive Webhook",
    };
  }
}

/**
 * Delete helper for Google Drive / Google Sheets
 */
export async function syncDeleteFromGoogleDrive(options: {
  id: string;
  docType: DocumentTypeOption;
  webhookUrl?: string;
}): Promise<{ success: boolean; message: string }> {
  const url = options.webhookUrl || process.env.GOOGLE_DRIVE_WEBHOOK_URL;
  if (!url) {
    return { success: false, message: "No Google Drive Webhook configured." };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        id: options.id,
        stationaryNo: options.id,
        invoiceNo: options.id,
        docType: options.docType,
      }),
      redirect: "follow",
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, message: data.message || "Row deleted from Google Sheet." };
    } else {
      return { success: false, message: `Google Sheet responded with ${response.status}` };
    }
  } catch (error: any) {
    console.error("[Google Drive Delete Sync Error]:", error);
    return {
      success: false,
      message: error.message || "Failed to sync delete with Google Drive",
    };
  }
}
