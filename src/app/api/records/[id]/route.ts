import { NextRequest, NextResponse } from "next/server";
import { getTransitRecordByStationaryNo, deleteTransitRecord, updateTransitRecord } from "@/lib/db";
import { syncDeleteFromGoogleDrive } from "@/lib/googledrive";
import { validateTransitRecord } from "@/lib/validation";
import { TransitRecord } from "@/types/transit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const docType = req.nextUrl.searchParams.get("docType") || undefined;
    const record = await getTransitRecordByStationaryNo(id, docType);
    if (!record) {
      return NextResponse.json(
        { success: false, error: `Record with Stationary No '${id}' not found` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, record });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve record" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const docType = body.docType || req.nextUrl.searchParams.get("docType") || undefined;

    const existing = await getTransitRecordByStationaryNo(id, docType);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Record '${id}' not found` },
        { status: 404 }
      );
    }

    const normalizedBody: Partial<TransitRecord> = {
      ...body,
      dispatchDate: body.dispatchDate || body.date,
      mdlNameConsigneeName: body.mdlNameConsigneeName || body.consigneeName || body.consignee,
      mineralName: body.mineralName || body.mineralGrade || body.grade,
      vehicleNo: body.vehicleNo || body.vehicle,
      dispatchQty: body.dispatchQty !== undefined && body.dispatchQty !== null
        ? Number(body.dispatchQty)
        : (body.dispatchQuantity !== undefined && body.dispatchQuantity !== null ? Number(body.dispatchQuantity) : undefined),
      productionQty: body.productionQty !== undefined && body.productionQty !== null
        ? Number(body.productionQty)
        : (body.productionQuantity !== undefined && body.productionQuantity !== null ? Number(body.productionQuantity) : undefined),
    };
    Object.keys(normalizedBody).forEach(
      (k) => (normalizedBody as any)[k] === undefined && delete (normalizedBody as any)[k]
    );

    const merged = { ...existing, ...normalizedBody, stationaryNo: id, docType: docType || existing.docType };

    // Validate merged fields
    const validation = validateTransitRecord(merged, []);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed for one or more fields",
          fieldErrors: validation.fieldErrors,
          warnings: validation.warnings,
        },
        { status: 422 }
      );
    }

    const result = await updateTransitRecord(id, merged);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to update record" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      record: result.record,
      message: `Record '${id}' updated successfully`,
      warnings: validation.warnings,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update record" },
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
    const docType = req.nextUrl.searchParams.get("docType") || undefined;
    const deleted = await deleteTransitRecord(id, docType);

    // Synchronize deletion with Google Sheets if webhook is configured
    try {
      const targetDocType = docType?.includes("original") ? "transit_original" : "transit_duplicate";
      await syncDeleteFromGoogleDrive({ id, docType: targetDocType });
    } catch (sheetErr) {
      console.warn("[Google Sheets Transit Delete Warn]:", sheetErr);
    }

    return NextResponse.json({
      success: true,
      message: `Record '${id}' successfully deleted`,
      deleted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete record" },
      { status: 500 }
    );
  }
}
