import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyDeviceSecret } from "@/lib/device-auth";

/**
 * POST /api/device/status
 * Lets a device explicitly report a status change outside the regular
 * heartbeat cycle - e.g. immediately on boot, or right before a graceful
 * shutdown/reboot so the dashboard doesn't have to wait for a heartbeat
 * timeout to show it offline.
 *
 * Body: {
 *   device_code: string,
 *   device_secret: string,
 *   status: "online" | "offline",
 *   firmware_version?: string,
 *   ip_address?: string
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

  if (!["online", "offline"].includes(body.status)) {
    return NextResponse.json({ error: 'status must be "online" or "offline".' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: device, error: findErr } = await supabase
    .from("attendance_devices")
    .select("id")
    .eq("device_code", body.device_code)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!device) {
    return NextResponse.json({ error: `Unknown device_code "${body.device_code}".` }, { status: 404 });
  }

  const update: Record<string, any> = { status: body.status };
  if (body.status === "online") update.last_heartbeat_at = new Date().toISOString();
  if (body.firmware_version) update.firmware_version = body.firmware_version;
  if (body.ip_address) update.ip_address = body.ip_address;

  const { error: updateErr } = await supabase.from("attendance_devices").update(update).eq("id", device.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
