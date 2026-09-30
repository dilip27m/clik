import { NextRequest, NextResponse } from "next/server";
import { deleteInvoice, updateInvoice, getInvoiceByNo } from "@/lib/db";
import { syncDeleteFromGoogleDrive } from "@/lib/googledrive";
import { validateInvoice } from "@/lib/validation";
import { InvoiceRecord } from "@/types/transit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await getInvoiceByNo(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Invoice '${id}' not found` },
        { status: 404 }
      );
    }

    const normalizedBody: Partial<InvoiceRecord> = {
      ...body,
      invoiceDate: body.invoiceDate || body.date,
      billTo: body.billTo || body.consignee,
      quantity: body.quantity !== undefined && body.quantity !== null
        ? Number(body.quantity)
        : (body.quantityMt !== undefined && body.quantityMt !== null ? Number(body.quantityMt) : undefined),
      ratePerUnit: body.ratePerUnit !== undefined && body.ratePerUnit !== null
        ? Number(body.ratePerUnit)
        : (body.rate !== undefined && body.rate !== null ? Number(body.rate) : undefined),
      taxableAmount: body.taxableAmount !== undefined && body.taxableAmount !== null ? Number(body.taxableAmount) : undefined,
      cgstAmount: body.cgstAmount !== undefined && body.cgstAmount !== null ? Number(body.cgstAmount) : undefined,
      sgstAmount: body.sgstAmount !== undefined && body.sgstAmount !== null ? Number(body.sgstAmount) : undefined,
      totalAmount: body.totalAmount !== undefined && body.totalAmount !== null
        ? Number(body.totalAmount)
        : (body.total !== undefined && body.total !== null ? Number(body.total) : undefined),
    };
    Object.keys(normalizedBody).forEach(
      (k) => (normalizedBody as any)[k] === undefined && delete (normalizedBody as any)[k]
    );

    const merged = { ...existing, ...normalizedBody, invoiceNo: id };

    // Validate merged fields
    const validation = validateInvoice(merged, []);
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

    const result = await updateInvoice(id, merged);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to update invoice" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      invoice: result.invoice,
      message: `Invoice '${id}' updated successfully`,
      warnings: validation.warnings,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update invoice" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteInvoice(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Failed to delete invoice '${id}'. Database query failed or database is offline.` },
        { status: 500 }
      );
    }

    // Synchronize deletion with Google Sheets if webhook is configured
    try {
      await syncDeleteFromGoogleDrive({ id, docType: "invoice" });
    } catch (sheetErr) {
      console.warn("[Google Sheets Invoice Delete Warn]:", sheetErr);
    }

    return NextResponse.json({
      success: true,
      message: `Invoice '${id}' successfully deleted`,
      deleted: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete invoice" },
      { status: 500 }
    );
  }
}
