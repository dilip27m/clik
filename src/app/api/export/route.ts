import { NextRequest, NextResponse } from "next/server";
import { getAllTransitRecords, getAllInvoices } from "@/lib/db";
import { generateTransitExcel, generateInvoiceExcel, generateCombinedMasterExcel } from "@/lib/excel";
import { MasterLogFilters } from "@/types/transit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docType = searchParams.get("docType") || "master";

    const filters: MasterLogFilters = {
      search: searchParams.get("search") || undefined,
      month: searchParams.get("month") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      company: searchParams.get("company") || undefined,
      grade: searchParams.get("grade") || undefined,
    };

    const dateStr = new Date().toISOString().split("T")[0];

    // Combined Master Workbook (All 3 Forms in 3 Tabs)
    if (docType === "master" || docType === "combined" || docType === "all") {
      const [dupRes, origRes, invRes] = await Promise.all([
        getAllTransitRecords(filters, "transit_duplicate"),
        getAllTransitRecords(filters, "transit_original"),
        getAllInvoices(filters),
      ]);

      const excelBuffer = await generateCombinedMasterExcel({
        duplicateRecords: dupRes.records,
        originalRecords: origRes.records,
        invoices: invRes.invoices,
      });

      const fileName = `AP_Mines_Master_Ledger_${dateStr}.xlsx`;

      return new NextResponse(excelBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": excelBuffer.length.toString(),
        },
      });
    }

    if (docType === "invoice") {
      const { invoices } = await getAllInvoices(filters);
      const excelBuffer = await generateInvoiceExcel(invoices);
      const fileName = `Tax_Invoices_Export_${dateStr}.xlsx`;

      return new NextResponse(excelBuffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": excelBuffer.length.toString(),
        },
      });
    }

    // Transit Forms (Original or Duplicate)
    const { records } = await getAllTransitRecords(filters, docType);
    const excelBuffer = await generateTransitExcel(records, docType);
    const prefix = docType.includes("original")
      ? "Transit_Pass_Original"
      : "Transit_Pass_Duplicate";
    const fileName = `${prefix}_Export_${dateStr}.xlsx`;

    return new NextResponse(excelBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": excelBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("[API /api/export Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate Excel export" },
      { status: 500 }
    );
  }
}
