import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * KNCC FAST RFID SCAN API
 * POST /api/device/scan
 *
 * ESP32 sends only { rfid_uid: "..." } in the JSON body.
 * Device authentication is sent in X-Device-Code / X-Device-Secret headers.
 * The server performs all card verification and attendance processing.
 * Every scan is also written to the existing attendance_sync_queue table so
 * the current Offline Sync page can display valid, invalid and duplicate scans.
 */

function normalizeUid(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[^0-9a-fA-F]/g, "").toUpperCase()
    : "";
}

function isValidUid(uid: string): boolean {
  return /^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid);
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

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Server misconfiguration: DEVICE_API_SECRET is not set." },
      { status: 500 }
    );
  }

  if (!deviceCode) {
    return NextResponse.json({ error: "X-Device-Code is required." }, { status: 400 });
  }

  if (!deviceSecret || deviceSecret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid device credentials." }, { status: 401 });
  }

  const rawUid =
    typeof body === "object" && body !== null && "rfid_uid" in body
      ? (body as { rfid_uid?: unknown }).rfid_uid
      : "";

  const uid = normalizeUid(rawUid);

  if (!uid) {
    return NextResponse.json({ error: "rfid_uid is required." }, { status: 400 });
  }

  if (!isValidUid(uid)) {
    return NextResponse.json(
      { result: "invalid_format", rfid_uid: uid, message: "Invalid RFID UID format." },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const scannedAt = new Date().toISOString();

  const { data: device, error: deviceError } = await supabase
    .from("attendance_devices")
    .select("id, device_code, device_name")
    .eq("device_code", deviceCode)
    .maybeSingle();

  if (deviceError) {
    return NextResponse.json({ error: deviceError.message }, { status: 500 });
  }

  if (!device) {
    return NextResponse.json(
      { result: "device_unknown", rfid_uid: uid, message: `Unknown device_code "${deviceCode}".` },
      { status: 404 }
    );
  }

  // Record every physical scan before verification.
  const { data: queueRow, error: queueError } = await supabase
    .from("attendance_sync_queue")
    .insert({
      device_id: device.id,
      rfid_uid: uid,
      scanned_at: scannedAt,
      sync_status: "pending",
      attempts: 1,
    })
    .select("id")
    .single();

  if (queueError || !queueRow) {
    return NextResponse.json(
      { error: queueError?.message ?? "Could not record scan.", rfid_uid: uid },
      { status: 500 }
    );
  }

  const { data: processData, error: processError } = await supabase.rpc("process_rfid_scan", {
    p_rfid_uid: uid,
    p_device_code: deviceCode,
    p_scanned_at: scannedAt,
  });

  if (processError) {
    await supabase
      .from("attendance_sync_queue")
      .update({ sync_status: "failed", error_message: processError.message, attempts: 1 })
      .eq("id", queueRow.id);

    return NextResponse.json(
      { result: "error", rfid_uid: uid, message: processError.message },
      { status: 500 }
    );
  }

  const result = Array.isArray(processData) ? processData[0] : processData;

  if (!result || result.result === "device_unknown") {
    await supabase
      .from("attendance_sync_queue")
      .update({ sync_status: "failed", error_message: "Unknown device.", attempts: 1 })
      .eq("id", queueRow.id);

    return NextResponse.json(
      { result: "device_unknown", rfid_uid: uid, message: "Unknown device." },
      { status: 404 }
    );
  }

  if (result.result === "card_invalid") {
    await supabase
      .from("attendance_sync_queue")
      .update({
        sync_status: "failed",
        error_message: "Card invalid / unregistered / disabled / unassigned.",
        attempts: 1,
      })
      .eq("id", queueRow.id);

    await supabase
      .from("attendance_devices")
      .update({ status: "online", last_scan_at: scannedAt })
      .eq("id", device.id);

    return NextResponse.json({
      result: "card_invalid",
      rfid_uid: uid,
      message: "Card invalid / unregistered / disabled / unassigned.",
    });
  }

  if (result.result === "duplicate_blocked") {
    await supabase
      .from("attendance_sync_queue")
      .update({
        sync_status: "synced",
        error_message: "Duplicate scan blocked.",
        processed_attendance_id: result.attendance_id ?? null,
        processed_at: scannedAt,
        attempts: 1,
      })
      .eq("id", queueRow.id);

    return NextResponse.json({
      result: "duplicate_blocked",
      rfid_uid: uid,
      message: "Duplicate scan blocked.",
      student_id: result.student_id ?? null,
    });
  }

  await supabase
    .from("attendance_sync_queue")
    .update({
      sync_status: "synced",
      processed_attendance_id: result.attendance_id ?? null,
      processed_at: scannedAt,
      error_message: null,
      attempts: 1,
    })
    .eq("id", queueRow.id);

  await supabase
    .from("attendance_devices")
    .update({ status: "online", last_scan_at: scannedAt })
    .eq("id", device.id);

  return NextResponse.json({
    result: "ok",
    rfid_uid: uid,
    attendance_id: result.attendance_id ?? null,
    attendance_type: result.attendance_type ?? null,
    status: result.attendance_status ?? null,
    student_id: result.student_id ?? null,
  });
}
