import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyDeviceSecret } from "@/lib/device-auth";

/**
 * POST /api/device/heartbeat
 * Called periodically (e.g. every 30-60s) by an online ESP32 device to
 * report it is alive and share basic diagnostics.
 *
 * Body: {
 *   device_code: string,          // e.g. "RFID-01"
 *   device_secret: string,
 *   firmware_version?: string,
 *   ip_address?: string,
 *   free_heap?: number,
 *   pending_records?: number    // count still queued on the SD card
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

  const supabase = createServiceClient();

  const { data: device, error: findErr } = await supabase
    .from("attendance_devices")
    .select("id")
    .eq("device_code", body.device_code)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!device) {
    return NextResponse.json(
      { error: `Unknown device_code "${body.device_code}". Register it first from the RFID Devices page.` },
      { status: 404 }
    );
  }

  const { error: updateErr } = await supabase
    .from("attendance_devices")
    .update({
      status: "online",
      last_heartbeat_at: new Date().toISOString(),
      firmware_version: body.firmware_version ?? undefined,
      ip_address: body.ip_address ?? undefined,
    })
    .eq("id", device.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabase.from("device_heartbeats").insert({
    device_id: device.id,
    firmware_version: body.firmware_version ?? null,
    ip_address: body.ip_address ?? null,
    free_heap: body.free_heap ?? null,
    pending_records: body.pending_records ?? 0,
  });

  return NextResponse.json({ ok: true, server_time: new Date().toISOString() });
}
