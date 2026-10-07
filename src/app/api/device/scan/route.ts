import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function normalizeUid(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[^0-9a-fA-F]/g, "").toUpperCase()
    : "";
}

function isValidUid(uid: string): boolean {
  return /^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid);
}

function normalizeSignal(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function signalFingerprint(signal: Record<string, unknown>): string | null {
  const stable = [signal.uid_size, signal.sak, signal.picc_type].map((v) => (v == null ? "" : String(v).trim().toUpperCase()));
  if (stable.every((v) => !v)) return null;
  // Same canonical inputs used by the SQL migration's md5 expression.
  // This value is informational here; SQL remains the source of truth.
  return stable.join("|");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const deviceCode = req.headers.get("x-device-code")?.trim() ?? "";
  const deviceSecret = req.headers.get("x-device-secret") ?? "";
  const expectedSecret = process.env.DEVICE_API_SECRET;

  if (!expectedSecret) return NextResponse.json({ error: "DEVICE_API_SECRET is not set." }, { status: 500 });
  if (!deviceCode) return NextResponse.json({ error: "X-Device-Code is required." }, { status: 400 });
  if (!deviceSecret || deviceSecret !== expectedSecret) return NextResponse.json({ error: "Invalid device credentials." }, { status: 401 });

  const record = body as Record<string, unknown>;
  const uid = normalizeUid(record?.rfid_uid);
  const signal = normalizeSignal(record?.rfid_signal ?? record?.signal_profile);

  if (!uid) return NextResponse.json({ error: "rfid_uid is required." }, { status: 400 });
  if (!isValidUid(uid)) return NextResponse.json({ result: "invalid_format", rfid_uid: uid, message: "Invalid RFID UID format." }, { status: 400 });

  let scannedAt = new Date().toISOString();
  if (typeof record?.scanned_at === "string") {
    const parsed = new Date(record.scanned_at);
    if (!Number.isNaN(parsed.getTime())) scannedAt = parsed.toISOString();
  }

  const supabase = createServiceClient();
  const { data: device, error: deviceError } = await supabase
    .from("attendance_devices")
    .select("id, device_code, device_name")
    .eq("device_code", deviceCode)
    .maybeSingle();

  if (deviceError) return NextResponse.json({ error: deviceError.message }, { status: 500 });
  if (!device) return NextResponse.json({ result: "device_unknown", rfid_uid: uid, message: `Unknown device_code "${deviceCode}".` }, { status: 404 });

  const { data: queueRow, error: queueError } = await supabase
    .from("attendance_sync_queue")
    .insert({
      device_id: device.id,
      rfid_uid: uid,
      scanned_at: scannedAt,
      signal_profile: signal,
      signal_fingerprint: signalFingerprint(signal),
      sync_status: "pending",
      attempts: 1,
    })
    .select("id")
    .single();

  if (queueError || !queueRow) {
    return NextResponse.json({ error: queueError?.message ?? "Could not record scan.", rfid_uid: uid }, { status: 500 });
  }

  const { data: processData, error: processError } = await supabase.rpc("process_rfid_scan_with_signal", {
    p_rfid_uid: uid,
    p_device_code: deviceCode,
    p_scanned_at: scannedAt,
    p_signal_profile: signal,
  });

  const result = Array.isArray(processData) ? processData[0] : processData;

  if (processError || !result) {
    await supabase.from("attendance_sync_queue").update({
      sync_status: "failed",
      verification_status: "error",
      error_message: processError?.message ?? "Processing failed.",
      processed_at: new Date().toISOString(),
      attempts: 1,
    }).eq("id", queueRow.id);
    return NextResponse.json({ result: "error", rfid_uid: uid, message: processError?.message ?? "Processing failed." }, { status: 500 });
  }

  const queueUpdate = {
    sync_status: result.result === "card_invalid" || result.result === "signal_mismatch" ? "failed" : "synced",
    verification_status: result.result === "ok"
      ? "received"
      : result.result,
    verified_student_id: result.student_id ?? null,
    verified_attendance_id: result.attendance_id ?? null,
    processed_attendance_id: result.attendance_id ?? null,
    processed_scan_event_id: result.scan_event_id ?? null,
    processed_at: new Date().toISOString(),
    error_message: result.message ?? null,
    attempts: 1,
  };

  await supabase.from("attendance_sync_queue").update(queueUpdate).eq("id", queueRow.id);

  return NextResponse.json({
    result: result.result,
    rfid_uid: uid,
    scan_event_id: result.scan_event_id ?? null,
    attendance_id: result.attendance_id ?? null,
    attendance_type: result.attendance_type ?? null,
    status: result.attendance_status ?? null,
    student_id: result.student_id ?? null,
    student_name: result.student_name ?? null,
    signal_action: result.signal_action ?? "not_provided",
    signal_verified: result.signal_verified ?? false,
    message: result.message ?? null,
  });
}
