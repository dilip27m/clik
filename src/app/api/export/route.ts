import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { BILL_TYPES, BILL_TYPE_ORDER, formatMonth } from "@/lib/bill-types";
import { listBills } from "@/lib/db";

// Excel copy of the bills — one sheet per bill type — for one month or everything.
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") || undefined;
  const wb = new ExcelJS.Workbook();
  for (const type of BILL_TYPE_ORDER) {
    const def = BILL_TYPES[type];
    const ws = wb.addWorksheet(def.sheetTab, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = def.fields.map((f) => ({
      header: f.label,
      key: f.key,
      width: f.kind === "text" ? 32 : 16,
      style: f.kind === "money" ? { numFmt: "₹#,##,##0.00" } : f.kind === "date" ? { numFmt: "dd-mmm-yyyy" } : {},
    }));
    ws.getRow(1).eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8F3F1D" } };
    });
    for (const bill of await listBills({ type, month, limit: 2000 })) {
      const row: Record<string, unknown> = { ...bill.data };
      if (bill.date) row.date = new Date(bill.date + "T00:00:00");
      ws.addRow(row);
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  const name = `Bills ${month ? formatMonth(month) : "All"}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
