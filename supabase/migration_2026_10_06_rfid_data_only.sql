-- KNCC RFID data-only scan processing update
-- Run after the existing RFID signal-history migration.
-- This keeps UID + signal diagnostics for history, but NEVER blocks a
-- registered active card because of signal mismatch.

create or replace function public.process_rfid_scan_with_signal(
  p_rfid_uid text,
  p_device_code text,
  p_scanned_at timestamptz default now(),
  p_signal_profile jsonb default '{}'::jsonb
)
returns table (
  result text,
  scan_event_id uuid,
  attendance_id uuid,
  attendance_type public.attendance_type,
  attendance_status public.attendance_status,
  student_id uuid,
  student_name text,
  signal_action text,
  signal_verified boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := upper(trim(p_rfid_uid));
  v_card public.rfid_cards%rowtype;
  v_device public.attendance_devices%rowtype;
  v_settings public.school_settings%rowtype;
  v_today date := (p_scanned_at at time zone 'Asia/Colombo')::date;
  v_has_entry boolean;
  v_type public.attendance_type;
  v_status public.attendance_status;
  v_new_id uuid;
  v_event_id uuid;
  v_fp text;
  v_signal_present boolean := false;
  v_signal_action text := 'stored';
  v_signal_verified boolean := false;
  v_message text := 'RFID data stored; signal profile is not used for verification.';
begin
  if coalesce(v_uid, '') = '' or coalesce(trim(p_device_code), '') = '' then
    raise exception 'RFID UID and device code are required';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_uid));

  select * into v_device
  from public.attendance_devices
  where device_code = trim(p_device_code);

  if v_device.id is null then
    return query select 'device_unknown', null::uuid, null::uuid, null::public.attendance_type,
      null::public.attendance_status, null::uuid, null::text, 'not_provided', false, 'Unknown device.';
    return;
  end if;

  -- Keep the RC522 profile for history only. It is never used to accept/reject
  -- a card in this data-only mode.
  if jsonb_typeof(coalesce(p_signal_profile, '{}'::jsonb)) = 'object'
     and coalesce(p_signal_profile::text, '{}') <> '{}' then
    v_signal_present := true;
    if coalesce(p_signal_profile->>'uid_size','') <> ''
       or coalesce(p_signal_profile->>'sak','') <> ''
       or coalesce(p_signal_profile->>'picc_type','') <> '' then
      v_fp := md5(
        concat_ws('|',
          coalesce(p_signal_profile->>'uid_size',''),
          upper(coalesce(p_signal_profile->>'sak','')),
          upper(coalesce(p_signal_profile->>'picc_type',''))
        )
      );
    end if;
  end if;

  select * into v_card
  from public.rfid_cards
  where upper(rfid_uid) = v_uid;

  -- Unknown/inactive/unassigned cards are still recorded in scan history,
  -- but cannot create a student attendance record until assigned.
  if v_card.id is null or v_card.status <> 'active' or v_card.student_id is null then
    insert into public.attendance_scan_events (
      device_id, rfid_card_id, student_id, rfid_uid, scanned_at,
      signal_profile, signal_fingerprint, verification_status, verification_message
    ) values (
      v_device.id, v_card.id, v_card.student_id, v_uid, p_scanned_at,
      case when v_signal_present then p_signal_profile else null end,
      v_fp,
      'card_invalid',
      'Card not registered as an active student card.'
    ) returning id into v_event_id;

    update public.attendance_devices
    set last_scan_at = p_scanned_at, status = 'online', updated_at = now()
    where id = v_device.id;

    return query select 'card_invalid', v_event_id, null::uuid, null::public.attendance_type,
      null::public.attendance_status, v_card.student_id,
      (select full_name from public.students where id = v_card.student_id),
      'stored_only', false,
      'RFID scan saved. Card is not assigned to an active student.';
    return;
  end if;

  -- First observed profile is stored as reference/history, but is NOT checked.
  if v_card.signal_fingerprint is null and v_fp is not null then
    update public.rfid_cards
    set signal_profile = p_signal_profile,
        signal_fingerprint = v_fp,
        first_signal_captured_at = coalesce(first_signal_captured_at, p_scanned_at),
        updated_at = now()
    where id = v_card.id;
    v_signal_action := 'stored_first';
    v_message := 'First RFID signal profile stored; signal verification is disabled.';
  end if;

  select * into v_settings from public.school_settings where id = 1;
  if v_settings.id is null then
    raise exception 'School attendance settings have not been configured by Super Admin';
  end if;

  select exists (
    select 1 from public.attendance_records
    where student_id = v_card.student_id
      and attendance_date = v_today
      and attendance_type = 'entry'
  ) into v_has_entry;

  v_type := case when v_has_entry then 'exit'::public.attendance_type else 'entry'::public.attendance_type end;
  v_status := case
    when v_type = 'entry' and (p_scanned_at at time zone 'Asia/Colombo')::time > v_settings.late_after_time
      then 'late'::public.attendance_status
    else 'present'::public.attendance_status
  end;

  -- Every physical scan of a known active card is saved.
  insert into public.attendance_scan_events (
    device_id, rfid_card_id, student_id, rfid_uid, scanned_at,
    signal_profile, signal_fingerprint, verification_status,
    verification_message, attendance_type, attendance_status
  ) values (
    v_device.id, v_card.id, v_card.student_id, v_uid, p_scanned_at,
    case when v_signal_present then p_signal_profile else null end,
    v_fp,
    'received',
    v_message, v_type, v_status
  ) returning id into v_event_id;

  -- Preserve the existing duplicate-scan window.
  if v_card.last_scanned_at is not null
     and p_scanned_at - v_card.last_scanned_at
       < make_interval(secs => v_settings.duplicate_scan_window_seconds) then
    update public.attendance_scan_events
    set verification_status = 'duplicate_blocked',
        verification_message = 'Raw scan saved; duplicate attendance window blocked a new attendance record.'
    where id = v_event_id;

    update public.rfid_cards
    set last_scanned_at = p_scanned_at, updated_at = now()
    where id = v_card.id;

    update public.attendance_devices
    set last_scan_at = p_scanned_at, status = 'online', updated_at = now()
    where id = v_device.id;

    return query select 'duplicate_blocked', v_event_id, null::uuid, v_type, v_status,
      v_card.student_id,
      (select full_name from public.students where id = v_card.student_id),
      v_signal_action, false,
      'Scan saved; duplicate attendance record was blocked.';
    return;
  end if;

  insert into public.attendance_records (
    student_id, rfid_card_id, device_id, attendance_date, scan_time,
    attendance_type, status, rfid_uid, signal_profile, signal_fingerprint, scan_event_id
  ) values (
    v_card.student_id, v_card.id, v_device.id, v_today, p_scanned_at,
    v_type, v_status, v_uid,
    case when v_signal_present then p_signal_profile else null end,
    v_fp, v_event_id
  ) on conflict (student_id, attendance_date, attendance_type) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    update public.attendance_scan_events
    set verification_status = 'duplicate_blocked',
        verification_message = 'Raw scan saved; an attendance record for this type already exists.',
        attendance_record_id = null
    where id = v_event_id;
  else
    update public.attendance_scan_events
    set attendance_record_id = v_new_id
    where id = v_event_id;
  end if;

  update public.rfid_cards
  set last_scanned_at = p_scanned_at, updated_at = now()
  where id = v_card.id;

  update public.attendance_devices
  set last_scan_at = p_scanned_at, status = 'online', updated_at = now()
  where id = v_device.id;

  if v_new_id is null then
    return query select 'duplicate_blocked', v_event_id, null::uuid, v_type, v_status,
      v_card.student_id,
      (select full_name from public.students where id = v_card.student_id),
      v_signal_action, false,
      'Scan saved; an attendance record for this type already exists.';
  else
    return query select 'ok', v_event_id, v_new_id, v_type, v_status,
      v_card.student_id,
      (select full_name from public.students where id = v_card.student_id),
      v_signal_action, false,
      v_message;
  end if;
end;
$$;

revoke all on function public.process_rfid_scan_with_signal(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.process_rfid_scan_with_signal(text, text, timestamptz, jsonb) to service_role;
