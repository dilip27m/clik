import { NextRequest, NextResponse } from "next/server";
import { syncRecordToGoogleDrive } from "@/lib/googledrive";
import { TransitRecord, InvoiceRecord, GoogleDriveSyncConfig, DocumentTypeOption } from "@/types/transit";

export async function GET() {
  const isEnvConfigured = Boolean(process.env.GOOGLE_DRIVE_WEBHOOK_URL?.trim());
  return NextResponse.json({
    success: true,
    isEnvConfigured,
    message: isEnvConfigured
      ? "Google Drive Webhook is securely configured in .env on the server"
      : "No webhook URL in .env",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { record, invoice, docType, config, testOnly } = body as {
      record?: TransitRecord;
      invoice?: InvoiceRecord;
      docType?: DocumentTypeOption;
      config?: GoogleDriveSyncConfig;
      testOnly?: boolean;
    };

    const webhookUrl = (config?.webhookUrl?.trim() || process.env.GOOGLE_DRIVE_WEBHOOK_URL?.trim()) || "";

    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: "Please configure GOOGLE_DRIVE_WEBHOOK_URL in .env or provide a webhook URL." },
        { status: 400 }
      );
    }

    const effectiveConfig: GoogleDriveSyncConfig = {
      enabled: config?.enabled ?? true,
      webhookUrl,
    };

    if (testOnly) {
      const res = await syncRecordToGoogleDrive({ testOnly: true }, { ...effectiveConfig, enabled: true });
      return NextResponse.json({ success: res.success, message: res.message });
    }

    if (!record && !invoice) {
      return NextResponse.json(
        { success: false, error: "No record or invoice provided to sync" },
        { status: 400 }
      );
    }

    const result = await syncRecordToGoogleDrive({ record, invoice, docType }, effectiveConfig);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
