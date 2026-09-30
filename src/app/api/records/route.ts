import { NextRequest, NextResponse } from "next/server";
import {
  getAllTransitRecords,
  saveTransitRecord,
  getOverallStats,
} from "@/lib/db";
import { validateTransitRecord } from "@/lib/validation";
import { TransitRecord, MasterLogFilters } from "@/types/transit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docType = searchParams.get("docType") || undefined;
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const stats = await getOverallStats();
      return NextResponse.json({ success: true, stats });
    }

    const filters: MasterLogFilters = {
      search: searchParams.get("search") || undefined,
      month: searchParams.get("month") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      company: searchParams.get("company") || undefined,
      grade: searchParams.get("grade") || undefined,
    };

    const [recordsResult, stats] = await Promise.all([
      getAllTransitRecords(filters, docType),
      getOverallStats(),
    ]);

    return NextResponse.json({
      success: true,
      records: recordsResult.records,
      isPostgres: recordsResult.isPostgres,
      stats,
    });
  } catch (error: any) {
    console.error("[API /api/records GET Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch transit records" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody: any = await req.json();

    if (!rawBody || !rawBody.stationaryNo) {
      return NextResponse.json(
        { success: false, error: "Stationary No is required as the Primary Key" },
        { status: 400 }
      );
    }

    const body: TransitRecord = {
      stationaryNo: String(rawBody.stationaryNo).trim(),
      docType: rawBody.docType || "transit_duplicate",
      dispatchDate: rawBody.dispatchDate || rawBody.date || "",
      mdlNameConsigneeName: rawBody.mdlNameConsigneeName || rawBody.consigneeName || rawBody.consignee || "",
      mineralName: rawBody.mineralName || rawBody.mineralGrade || rawBody.grade || "",
      vehicleNo: rawBody.vehicleNo || rawBody.vehicle || "",
      dispatchQty: rawBody.dispatchQty !== undefined && rawBody.dispatchQty !== null
        ? Number(rawBody.dispatchQty)
        : (rawBody.dispatchQuantity !== undefined && rawBody.dispatchQuantity !== null
            ? Number(rawBody.dispatchQuantity)
            : (rawBody.qty !== undefined && rawBody.qty !== null ? Number(rawBody.qty) : null)),
      productionQty: rawBody.productionQty !== undefined && rawBody.productionQty !== null
        ? Number(rawBody.productionQty)
        : (rawBody.productionQuantity !== undefined && rawBody.productionQuantity !== null
            ? Number(rawBody.productionQuantity)
            : null),
      imageUrl: rawBody.imageUrl || "",
    };

    const { records } = await getAllTransitRecords({}, body.docType);
    const existingKeys = records.map((r) => r.stationaryNo.trim().toUpperCase());
    const cleanKey = body.stationaryNo.trim().toUpperCase();

    if (existingKeys.includes(cleanKey)) {
      return NextResponse.json(
        {
          success: false,
          error: `Duplicate rejected: A Transit Form with Stationary No '${body.stationaryNo}' already exists in database.`,
          isDuplicate: true,
        },
        { status: 409 }
      );
    }

    const validation = validateTransitRecord(body, []);
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

    const saveResult = await saveTransitRecord(body);

    if (!saveResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: (saveResult as any).error || `Failed to save Transit Form ${body.stationaryNo}`,
          isDuplicate: saveResult.isDuplicate,
        },
        { status: saveResult.isDuplicate ? 409 : 503 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        record: saveResult.record,
        message: `Successfully saved Transit Form ${body.stationaryNo}`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[API /api/records POST Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save record" },
      { status: 500 }
    );
  }
}
