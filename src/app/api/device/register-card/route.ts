import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyDeviceSecret } from "@/lib/device-auth";

/**
 * POST /api/device/register-card
 * Used when an admin puts a device into "registration mode" (e.g. via a
 * dedicated card-enrollment reader, or the same gate reader in a special
 * mode) and taps a brand-new physical card. This does NOT create an
 * attendance record and does NOT assign a student - it simply makes the
 * RFID UID known to the system as "unregistered" so a Super Admin can
 * find it on the RFID Cards page and assign it to a student.
 *
 * Body: {
 *   device_code: string,
 *   device_secret: string,
 *   rfid_uid: string
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

  const supabase = createServiceClient();

  const { data: device } = await supabase
    .from("attendance_devices")
    .select("id")
    .eq("device_code", body.device_code)
    .maybeSingle();

  if (!device) {
    return NextResponse.json({ error: `Unknown device_code "${body.device_code}".` }, { status: 404 });
  }

  const uid = body.rfid_uid.trim().toUpperCase();

  const { data: existing } = await supabase
    .from("rfid_cards")
    .select("id, status, student_id, student:students(full_name, index_number)")
    .ilike("rfid_uid", uid)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      result: "already_known",
      card_status: existing.status,
      assigned_student: existing.student ?? null,
    });
  }

  const { data: created, error } = await supabase
    .from("rfid_cards")
    .insert({ rfid_uid: uid, status: "unregistered" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ result: "registered", card_id: created.id, rfid_uid: created.rfid_uid, status: created.status });
}
