import { NextRequest, NextResponse } from "next/server";
import { getAllInvoices, saveInvoice, getInvoiceByNo, getOverallStats } from "@/lib/db";
import { InvoiceRecord, MasterLogFilters } from "@/types/transit";
import { validateInvoice } from "@/lib/validation";
import { syncRecordToGoogleDrive } from "@/lib/googledrive";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filters: MasterLogFilters = {
      search: searchParams.get("search") || undefined,
      month: searchParams.get("month") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      company: searchParams.get("company") || undefined,
    };

    const [result, stats] = await Promise.all([
      getAllInvoices(filters),
      getOverallStats(),
    ]);

    return NextResponse.json({
      success: true,
      invoices: result.invoices,
      isPostgres: result.isPostgres,
      stats,
    });
  } catch (error: any) {
    console.error("[API /api/invoices GET Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody: any = await req.json();

    const body: InvoiceRecord = {
      invoiceNo: String(rawBody.invoiceNo || "").trim(),
      invoiceDate: rawBody.invoiceDate || rawBody.date || "",
      billTo: rawBody.billTo || rawBody.consignee || "",
      quantity: rawBody.quantity !== undefined && rawBody.quantity !== null
        ? Number(rawBody.quantity)
        : (rawBody.quantityMt !== undefined && rawBody.quantityMt !== null
            ? Number(rawBody.quantityMt)
            : (rawBody.qty !== undefined && rawBody.qty !== null ? Number(rawBody.qty) : null)),
      ratePerUnit: rawBody.ratePerUnit !== undefined && rawBody.ratePerUnit !== null
        ? Number(rawBody.ratePerUnit)
        : (rawBody.rate !== undefined && rawBody.rate !== null ? Number(rawBody.rate) : null),
      taxableAmount: rawBody.taxableAmount !== undefined && rawBody.taxableAmount !== null ? Number(rawBody.taxableAmount) : null,
      cgstAmount: rawBody.cgstAmount !== undefined && rawBody.cgstAmount !== null ? Number(rawBody.cgstAmount) : null,
      sgstAmount: rawBody.sgstAmount !== undefined && rawBody.sgstAmount !== null ? Number(rawBody.sgstAmount) : null,
      totalAmount: rawBody.totalAmount !== undefined && rawBody.totalAmount !== null
        ? Number(rawBody.totalAmount)
        : (rawBody.total !== undefined && rawBody.total !== null ? Number(rawBody.total) : null),
      imageUrl: rawBody.imageUrl || "",
    };

    const validation = validateInvoice(body, []);

    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed for one or more invoice fields",
          fieldErrors: validation.fieldErrors,
          warnings: validation.warnings,
        },
        { status: 422 }
      );
    }

    const saveResult = await saveInvoice(body);

    if (!saveResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: saveResult.isDuplicate
            ? `Duplicate rejected: Invoice No '${body.invoiceNo}' already exists in database.`
            : (saveResult as any).error || `Failed to save Invoice ${body.invoiceNo}`,
          isDuplicate: saveResult.isDuplicate,
        },
        { status: saveResult.isDuplicate ? 409 : 503 }
      );
    }

    // Non-blocking background sync to Google Sheets
    const webhookUrl = (rawBody.webhookUrl || process.env.GOOGLE_DRIVE_WEBHOOK_URL)?.trim();
    if (webhookUrl) {
      syncRecordToGoogleDrive(
        { invoice: saveResult.invoice || body, docType: "invoice" },
        { enabled: true, webhookUrl }
      ).catch((syncErr) => {
        console.warn("[Auto-Sync Google Sheets Invoice Error]:", syncErr);
      });
    }

    return NextResponse.json(
      {
        success: true,
        invoice: saveResult.invoice,
        googleDriveSynced: Boolean(webhookUrl),
        message: `Successfully saved Invoice ${body.invoiceNo}`,
        warnings: validation.warnings,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[API /api/invoices POST Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save invoice" },
      { status: 500 }
    );
  }
}
