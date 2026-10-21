// =====================================================================
//  Sri Lalithha Pulverisers — Bill Book (Google Sheet + Drive photos)
//
//  Paste this whole file into Extensions → Apps Script of your Google
//  Sheet, then Deploy → New deployment → Web app
//  (Execute as: Me, Who has access: Anyone). Copy the Web app URL into
//  GOOGLE_SHEETS_WEBHOOK_URL on Vercel.
//
//  The app sends each saved bill here. This script:
//    • keeps one neat tab per bill type (updates the row if it exists)
//    • saves the bill photo in Drive → "Bill Photos" and links it
//    • rebuilds the "Monthly Summary" tab
// =====================================================================

// Optional: put the same text in SHEETS_TOKEN on Vercel to block strangers.
var TOKEN = "";

var PHOTO_FOLDER = "Bill Photos";
var SUMMARY_TAB = "Monthly Summary";

var COLORS = {
  header: "#8F3F1D",    // terracotta
  headerText: "#FFFFFF",
  band: "#FBF3E8",      // warm cream
  border: "#E6D5BF",
  title: "#2B2118",
  totalBg: "#F3E3CC",
};

var INR = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"##,##0.00';
var QTY = '#,##0.00';
var DATE = 'dd-mmm-yyyy';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    if (TOKEN && data.token !== TOKEN) return reply({ success: false, error: "Wrong token" });

    if (data.action === "ping") return reply({ success: true, message: "Connected to " + SpreadsheetApp.getActive().getName() });
    if (data.action === "upsert") return reply(upsert(data));
    if (data.action === "delete") return reply(removeRow(data));
    return reply({ success: false, error: "Unknown action" });
  } catch (err) {
    return reply({ success: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// data = { tab, columns:[{label, kind}], key, values:[...], photo?:{base64,mime,name} }
function upsert(data) {
  var sheet = ensureTab(data.tab, data.columns);
  var photoCol = data.columns.length + 1;
  var rowIndex = findRow(sheet, data.key);
  var values = data.values.map(function (v, i) { return toCell(v, data.columns[i].kind); });

  var photoUrl = null;
  if (data.photo && data.photo.base64) {
    photoUrl = savePhoto(data.tab, data.photo);
  }

  if (rowIndex === -1) {
    sheet.appendRow(values);
    rowIndex = sheet.getLastRow();
  } else {
    sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  }
  if (photoUrl) {
    sheet.getRange(rowIndex, photoCol).setFormula('=HYPERLINK("' + photoUrl + '","View bill")');
  }

  sortByDate(sheet, data.columns);
  rebuildSummary();
  return { success: true, photoUrl: photoUrl };
}

function removeRow(data) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(data.tab);
  if (!sheet) return { success: true, deleted: false };
  var rowIndex = findRow(sheet, data.key);
  if (rowIndex !== -1) sheet.deleteRow(rowIndex);
  rebuildSummary();
  return { success: true, deleted: rowIndex !== -1 };
}

function findRow(sheet, key) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var keys = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  var want = String(key).trim().toUpperCase();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim().toUpperCase() === want) return i + 2;
  }
  return -1;
}

function toCell(v, kind) {
  if (v === null || v === undefined || v === "") return "";
  if (kind === "date") {
    var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : v;
  }
  if (kind === "money" || kind === "qty") return Number(v);
  // Plain text: stop Sheets turning "2026-27/28" into a date.
  return "'" + String(v);
}

function ensureTab(name, columns) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(name);
  var headers = columns.map(function (c) { return c.label; }).concat(["Photo"]);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    styleTab(sheet, columns, headers);
  } else if (sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0].join("|") !== headers.join("|")) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleTab(sheet, columns, headers);
  }
  return sheet;
}

function styleTab(sheet, columns, headers) {
  var n = headers.length;
  sheet.getRange(1, 1, 1, n).setValues([headers])
    .setBackground(COLORS.header).setFontColor(COLORS.headerText)
    .setFontWeight("bold").setFontSize(11).setVerticalAlignment("middle").setWrap(true);
  sheet.setRowHeight(1, 40);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  var rows = sheet.getMaxRows() - 1;
  columns.forEach(function (c, i) {
    var col = sheet.getRange(2, i + 1, rows, 1);
    if (c.kind === "money") col.setNumberFormat(INR).setHorizontalAlignment("right");
    else if (c.kind === "qty") col.setNumberFormat(QTY).setHorizontalAlignment("right");
    else if (c.kind === "date") col.setNumberFormat(DATE).setHorizontalAlignment("center");
    else col.setNumberFormat("@");
    sheet.setColumnWidth(i + 1, c.kind === "money" ? 130 : c.kind === "date" || c.kind === "qty" ? 110 : 190);
  });
  sheet.setColumnWidth(n, 100);
  sheet.getRange(2, n, rows, 1).setHorizontalAlignment("center").setFontColor(COLORS.header);
  sheet.getRange(1, 1, sheet.getMaxRows(), n).setFontFamily("Roboto").setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);

  sheet.getBandings().forEach(function (b) { b.remove(); });
  var banding = sheet.getRange(1, 1, sheet.getMaxRows(), n).applyRowBanding();
  banding.setHeaderRowColor(COLORS.header).setFirstRowColor("#FFFFFF").setSecondRowColor(COLORS.band);

  // Remove the default extra columns so the tab looks tidy.
  if (sheet.getMaxColumns() > n) sheet.deleteColumns(n + 1, sheet.getMaxColumns() - n);
}

function sortByDate(sheet, columns) {
  var dateCol = -1;
  columns.forEach(function (c, i) { if (c.kind === "date" && dateCol === -1) dateCol = i + 1; });
  var last = sheet.getLastRow();
  if (dateCol === -1 || last < 3) return;
  sheet.getRange(2, 1, last - 1, columns.length + 1).sort({ column: dateCol, ascending: false });
}

function savePhoto(tab, photo) {
  var root = getFolder(DriveApp.getRootFolder(), PHOTO_FOLDER);
  var folder = getFolder(root, tab);
  var blob = Utilities.newBlob(Utilities.base64Decode(photo.base64), photo.mime || "image/jpeg", photo.name || "bill.jpg");
  var existing = folder.getFilesByName(blob.getName());
  while (existing.hasNext()) existing.next().setTrashed(true);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function getFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ── Monthly Summary ──────────────────────────────────────────────────

var SUMMARY_SOURCES = [
  { tab: "Transit Forms", label: "Transit Forms (ore in)", qty: "Dispatch Qty (MT)" },
  { tab: "APMDC Bills", label: "APMDC Bills (purchase)", qty: "Quantity (MT)", amount: "Invoice Value", gst: ["CGST", "SGST"] },
  { tab: "Form E", label: "Form E (powder out)", qty: "Quantity (MT)", amount: "Sale Value" },
  { tab: "Sales Bills", label: "Sales Bills", qty: "Quantity", amount: "Total", gst: ["CGST", "SGST"] },
];

function rebuildSummary() {
  var ss = SpreadsheetApp.getActive();
  var months = {};

  SUMMARY_SOURCES.forEach(function (src) {
    var sheet = ss.getSheetByName(src.tab);
    if (!sheet || sheet.getLastRow() < 2) return;
    var values = sheet.getDataRange().getValues();
    var head = values[0];
    var iDate = head.indexOf(head.filter(function (h) { return /Date/.test(h); })[0]);
    var iQty = head.indexOf(src.qty);
    var iAmt = src.amount ? head.indexOf(src.amount) : -1;
    var iGst = (src.gst || []).map(function (g) { return head.indexOf(g); });
    for (var r = 1; r < values.length; r++) {
      var d = values[r][iDate];
      if (!(d instanceof Date)) continue;
      var key = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM");
      var m = months[key] = months[key] || {};
      var t = m[src.tab] = m[src.tab] || { count: 0, qty: 0, amount: 0, gst: 0 };
      t.count++;
      t.qty += Number(values[r][iQty]) || 0;
      if (iAmt >= 0) t.amount += Number(values[r][iAmt]) || 0;
      iGst.forEach(function (i) { if (i >= 0) t.gst += Number(values[r][i]) || 0; });
    }
  });

  var sheet = ss.getSheetByName(SUMMARY_TAB) || ss.insertSheet(SUMMARY_TAB, 0);
  sheet.clear();
  sheet.getBandings().forEach(function (b) { b.remove(); });

  var headers = ["Month", "Bill type", "No. of bills", "Quantity (MT)", "Amount", "GST"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground(COLORS.header).setFontColor(COLORS.headerText).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);

  var rows = [];
  var monthRows = [];
  Object.keys(months).sort().reverse().forEach(function (key) {
    var p = key.split("-");
    var label = Utilities.formatDate(new Date(Number(p[0]), Number(p[1]) - 1, 1), Session.getScriptTimeZone(), "MMMM yyyy");
    monthRows.push(rows.length + 2);
    SUMMARY_SOURCES.forEach(function (src, i) {
      var t = months[key][src.tab] || { count: 0, qty: 0, amount: 0, gst: 0 };
      rows.push([i === 0 ? label : "", src.label, t.count, t.qty, src.amount ? t.amount : "", src.gst ? t.gst : ""]);
    });
  });

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.getRange(2, 4, rows.length, 1).setNumberFormat(QTY);
    sheet.getRange(2, 5, rows.length, 2).setNumberFormat(INR);
    sheet.getRange(2, 1, rows.length, 1).setFontWeight("bold").setFontColor(COLORS.header);
    monthRows.forEach(function (r) {
      sheet.getRange(r, 1, 1, headers.length).setBorder(true, null, null, null, null, null, COLORS.header, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    });
    sheet.getRange(2, 1, rows.length, headers.length).setBorder(null, null, true, null, null, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
  }
  sheet.getRange(1, 1, Math.max(rows.length + 1, 1), headers.length).setFontFamily("Roboto").setVerticalAlignment("middle");
  sheet.setColumnWidths(1, 1, 140);
  sheet.setColumnWidths(2, 1, 200);
  sheet.setColumnWidths(3, 4, 130);
  if (sheet.getMaxColumns() > headers.length) sheet.deleteColumns(headers.length + 1, sheet.getMaxColumns() - headers.length);
}
