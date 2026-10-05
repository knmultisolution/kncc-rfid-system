import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyDeviceSecret } from "@/lib/device-auth";

function normalizeSignal(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeUid(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^0-9a-fA-F]/g, "").toUpperCase() : "";
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const authError = verifyDeviceSecret(body);
  if (authError) return authError;
  if (!Array.isArray(body.records) || body.records.length === 0) return NextResponse.json({ error: "records must be a non-empty array." }, { status: 400 });
  if (body.records.length > 500) return NextResponse.json({ error: "Batch too large; send at most 500 records per request." }, { status: 400 });

  const supabase = createServiceClient();
  const { data: device, error: findErr } = await supabase.from("attendance_devices").select("id").eq("device_code", body.device_code).maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!device) return NextResponse.json({ error: `Unknown device_code "${body.device_code}".` }, { status: 404 });

  const results: any[] = [];
  for (const rec of body.records) {
    const uid = normalizeUid(rec?.rfid_uid);
    if (!uid || !rec?.scanned_at) {
      results.push({ rfid_uid: uid || rec?.rfid_uid || null, status: "failed", error: "rfid_uid and scanned_at are required" });
      continue;
    }
    const scannedAt = new Date(rec.scanned_at);
    if (Number.isNaN(scannedAt.getTime())) {
      results.push({ rfid_uid: uid, status: "failed", error: "invalid scanned_at" });
      continue;
    }
    const signal = normalizeSignal(rec?.rfid_signal ?? rec?.signal_profile);

    const { data: queueRow, error: queueErr } = await supabase.from("attendance_sync_queue").insert({
      device_id: device.id,
      rfid_uid: uid,
      scanned_at: scannedAt.toISOString(),
      signal_profile: signal,
      sync_status: "pending",
      attempts: 1,
    }).select("id").single();
    if (queueErr || !queueRow) {
      results.push({ rfid_uid: uid, status: "failed", error: queueErr?.message ?? "queue insert failed" });
      continue;
    }

    const { data: procData, error: procErr } = await supabase.rpc("process_rfid_scan_with_signal", {
      p_rfid_uid: uid,
      p_device_code: body.device_code,
      p_scanned_at: scannedAt.toISOString(),
      p_signal_profile: signal,
    });
    const result = Array.isArray(procData) ? procData[0] : procData;

    if (procErr || !result) {
      await supabase.from("attendance_sync_queue").update({ sync_status: "failed", verification_status: "error", error_message: procErr?.message ?? "processing failed", processed_at: new Date().toISOString(), attempts: 1 }).eq("id", queueRow.id);
      results.push({ rfid_uid: uid, status: "failed", error: procErr?.message ?? "processing failed" });
      continue;
    }

    const synced = !["card_invalid", "signal_mismatch"].includes(result.result);
    await supabase.from("attendance_sync_queue").update({
      sync_status: synced ? "synced" : "failed",
      verification_status: result.result === "ok" ? (result.signal_action === "enrolled" ? "signal_enrolled" : "verified") : result.result,
      verified_student_id: result.student_id ?? null,
      verified_attendance_id: result.attendance_id ?? null,
      processed_attendance_id: result.attendance_id ?? null,
      processed_scan_event_id: result.scan_event_id ?? null,
      processed_at: new Date().toISOString(),
      error_message: result.message ?? null,
      attempts: 1,
    }).eq("id", queueRow.id);

    results.push({
      rfid_uid: uid,
      status: synced ? "synced" : "rejected",
      result: result.result,
      signal_action: result.signal_action ?? "not_provided",
      signal_verified: result.signal_verified ?? false,
      attendance_id: result.attendance_id ?? null,
      student_name: result.student_name ?? null,
      scan_event_id: result.scan_event_id ?? null,
    });
  }

  await supabase.from("attendance_devices").update({ status: "online", last_scan_at: new Date().toISOString() }).eq("id", device.id);
  return NextResponse.json({
    ok: true,
    processed: results.length,
    synced: results.filter((r) => r.status === "synced").length,
    failed: results.filter((r) => r.status === "failed").length,
    rejected: results.filter((r) => r.status === "rejected").length,
    results,
  });
}
