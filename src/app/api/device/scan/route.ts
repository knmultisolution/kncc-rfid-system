import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyDeviceSecret } from "@/lib/device-auth";

/**
 * POST /api/device/scan
 * Called by an ESP32 device immediately after a successful RFID read,
 * while it has connectivity. Runs the attendance engine
 * (public.process_rfid_scan) which decides entry/exit, late/present,
 * and blocks duplicate scans within the configured window.
 *
 * Body (matches kncc-esp32-rfid-terminal/docs/api-contract.md exactly): {
 *   device_code: string,       // e.g. "RFID-01"
 *   device_secret: string,
 *   rfid_uid: string,
 *   scanned_at: string,        // ISO 8601, from the device's RTC (or NTP fallback)
 *   sync_status?: string       // advisory only; always "synced" for a live submission
 * }
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const authError = verifyDeviceSecret(body);
  if (authError) return authError;

  if (!body.rfid_uid || typeof body.rfid_uid !== "string") {
    return NextResponse.json({ error: "rfid_uid is required." }, { status: 400 });
  }

  const scannedAt = body.scanned_at ? new Date(body.scanned_at) : new Date();
  if (Number.isNaN(scannedAt.getTime())) {
    return NextResponse.json({ error: "scanned_at is not a valid date." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("process_rfid_scan", {
    p_rfid_uid: body.rfid_uid,
    p_device_code: body.device_code,
    p_scanned_at: scannedAt.toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = Array.isArray(data) ? data[0] : data;

  if (!result || result.result === "device_unknown") {
    return NextResponse.json(
      { error: `Unknown device_code "${body.device_code}". Register it first.` },
      { status: 404 }
    );
  }
  if (result.result === "card_invalid") {
    return NextResponse.json({ result: "card_invalid", message: "Card is unregistered, disabled, or unassigned. No record created." }, { status: 200 });
  }
  if (result.result === "duplicate_blocked") {
    return NextResponse.json({ result: "duplicate_blocked", message: "Scan ignored: within the duplicate-scan window." }, { status: 200 });
  }

  return NextResponse.json({
    result: "ok",
    attendance_id: result.attendance_id,
    attendance_type: result.attendance_type,
    status: result.attendance_status,
    student_id: result.student_id,
  });
}
