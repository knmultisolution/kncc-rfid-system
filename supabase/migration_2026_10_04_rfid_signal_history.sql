-- KNCC RFID Attendance System: RFID signal profile + every-scan history
-- Run AFTER schema.sql and supabase-security-upgrade.sql.
-- Safe additive migration: does not delete students/cards/attendance data.

begin;

-- ---------------------------------------------------------------------------
-- RFID card signal profile
-- NOTE: classic RC522 does not expose a reliable per-card RSSI measurement.
-- We therefore store a deterministic card/read profile (UID size, SAK, PICC
-- type) plus diagnostic reader fields sent by the ESP32. This is a verification
-- fingerprint, not a cryptographic replacement for the UID itself.
-- ---------------------------------------------------------------------------
alter table public.rfid_cards
  add column if not exists signal_profile jsonb,
  add column if not exists signal_fingerprint text,
  add column if not exists first_signal_captured_at timestamptz,
  add column if not exists last_signal_verified_at timestamptz,
  add column if not exists signal_verify_count integer not null default 0;

create index if not exists idx_rfid_cards_signal_fingerprint
  on public.rfid_cards (signal_fingerprint)
  where signal_fingerprint is not null;

-- ---------------------------------------------------------------------------
-- Raw scan history: ONE row for EVERY physical scan.
-- This is intentionally separate from attendance_records, whose existing daily
-- entry/exit uniqueness remains intact. Thus two scans can both be preserved
-- as attendance scan events even when one logical attendance record is blocked
-- as a duplicate.
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_scan_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.attendance_devices (id) on delete set null,
  rfid_card_id uuid references public.rfid_cards (id) on delete set null,
  student_id uuid references public.students (id) on delete set null,
  rfid_uid text not null,
  scanned_at timestamptz not null,
  signal_profile jsonb,
  signal_fingerprint text,
  verification_status text not null,
  verification_message text,
  attendance_record_id uuid references public.attendance_records (id) on delete set null,
  attendance_type public.attendance_type,
  attendance_status public.attendance_status,
  source_sync_queue_id uuid unique references public.attendance_sync_queue (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_events_scanned_at
  on public.attendance_scan_events (scanned_at desc);
create index if not exists idx_scan_events_uid_scanned_at
  on public.attendance_scan_events (rfid_uid, scanned_at desc);
create index if not exists idx_scan_events_student_scanned_at
  on public.attendance_scan_events (student_id, scanned_at desc);
create index if not exists idx_scan_events_status
  on public.attendance_scan_events (verification_status, scanned_at desc);
create index if not exists idx_scan_events_source_queue
  on public.attendance_scan_events (source_sync_queue_id);

-- Keep the signal details with the logical attendance row too, so the
-- first/enrolment attendance and later verified attendance are self-contained.
alter table public.attendance_records
  add column if not exists rfid_uid text,
  add column if not exists signal_profile jsonb,
  add column if not exists signal_fingerprint text,
  add column if not exists scan_event_id uuid references public.attendance_scan_events (id) on delete set null;

create index if not exists idx_attendance_records_scan_event
  on public.attendance_records (scan_event_id);
create index if not exists idx_attendance_records_signal_fingerprint
  on public.attendance_records (signal_fingerprint)
  where signal_fingerprint is not null;

alter table public.attendance_scan_events enable row level security;

drop policy if exists attendance_scan_events_select on public.attendance_scan_events;
create policy attendance_scan_events_select
  on public.attendance_scan_events for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role is not null
        and (
          p.role in ('super_admin', 'principal')
          or exists (
            select 1 from public.students s
            where s.id = public.attendance_scan_events.student_id
              and (
                (p.role = 'teacher' and exists (
                  select 1 from public.teacher_assignments ta
                  where ta.teacher_id = p.id and ta.class_id = s.class_id
                ))
                or
                (p.role = 'sectional_head' and exists (
                  select 1 from public.sectional_head_assignments sha
                  where sha.sectional_head_id = p.id and sha.grade_id = s.grade_id
                ))
              )
          )
          or (public.attendance_scan_events.student_id is null and p.role in ('teacher','sectional_head'))
        )
    )
  );

-- Keep the existing sync queue useful as a raw-scan audit trail as well.
alter table public.attendance_sync_queue
  add column if not exists signal_profile jsonb,
  add column if not exists signal_fingerprint text,
  add column if not exists verification_status text,
  add column if not exists verified_student_id uuid references public.students (id) on delete set null,
  add column if not exists verified_attendance_id uuid references public.attendance_records (id) on delete set null,
  add column if not exists processed_at timestamptz,
  add column if not exists attempts integer not null default 0;

alter table public.attendance_sync_queue
  add column if not exists processed_scan_event_id uuid references public.attendance_scan_events (id) on delete set null;

create index if not exists idx_sync_queue_created_at
  on public.attendance_sync_queue (created_at desc);
create index if not exists idx_sync_queue_verification
  on public.attendance_sync_queue (verification_status, created_at desc);

-- Backfill historical queue rows once. The unique source link prevents duplicates
-- when this migration is safely re-run.
insert into public.attendance_scan_events (
  device_id, rfid_card_id, student_id, rfid_uid, scanned_at,
  signal_profile, signal_fingerprint, verification_status, verification_message,
  attendance_record_id, attendance_type, attendance_status, source_sync_queue_id
)
select
  q.device_id,
  ar.rfid_card_id,
  ar.student_id,
  q.rfid_uid,
  q.scanned_at,
  q.signal_profile,
  q.signal_fingerprint,
  coalesce(q.verification_status, case when q.sync_status = 'synced' then 'legacy_synced' when q.sync_status = 'failed' then 'legacy_failed' else 'legacy_pending' end),
  q.error_message,
  q.processed_attendance_id,
  ar.attendance_type,
  ar.status,
  q.id
from public.attendance_sync_queue q
left join public.attendance_records ar on ar.id = q.processed_attendance_id
where not exists (select 1 from public.attendance_scan_events e where e.source_sync_queue_id = q.id);

update public.attendance_sync_queue q
set processed_scan_event_id = e.id
from public.attendance_scan_events e
where e.source_sync_queue_id = q.id
  and q.processed_scan_event_id is null;


-- Heartbeat route already sends these fields; make the table match the API.
alter table public.device_heartbeats
  add column if not exists firmware_version text,
  add column if not exists ip_address text,
  add column if not exists free_heap integer;

-- ---------------------------------------------------------------------------
-- New server-side scan processor.
-- Every call produces one attendance_scan_events row for valid UID + known
-- device. Signal profile is enrolled on the first valid scan and checked on
-- later scans. Every valid scan still goes through the normal attendance engine.
-- ---------------------------------------------------------------------------
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
  v_signal_action text := 'not_provided';
  v_signal_verified boolean := false;
  v_message text := null;
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

  if v_card.id is null or v_card.status <> 'active' or v_card.student_id is null then
    insert into public.attendance_scan_events (
      device_id, rfid_card_id, student_id, rfid_uid, scanned_at,
      signal_profile, signal_fingerprint, verification_status, verification_message
    ) values (
      v_device.id, v_card.id, v_card.student_id, v_uid, p_scanned_at,
      case when v_signal_present then p_signal_profile else null end,
      v_fp,
      'card_invalid',
      'Card invalid, unregistered, disabled, lost, replaced, or unassigned.'
    ) returning id into v_event_id;

    return query select 'card_invalid', v_event_id, null::uuid, null::public.attendance_type,
      null::public.attendance_status, null::uuid, null::text, 'invalid_card', false,
      'Card invalid / unregistered / disabled / unassigned.';
    return;
  end if;

  -- First valid scan: capture the stable card/read profile.
  if v_card.signal_fingerprint is null and v_fp is not null then
    update public.rfid_cards
    set signal_profile = p_signal_profile,
        signal_fingerprint = v_fp,
        first_signal_captured_at = coalesce(first_signal_captured_at, p_scanned_at),
        last_signal_verified_at = p_scanned_at,
        signal_verify_count = coalesce(signal_verify_count, 0) + 1,
        updated_at = now()
    where id = v_card.id;
    v_signal_action := 'enrolled';
    v_signal_verified := true;
    v_message := 'First signal profile saved.';
  elsif v_fp is null then
    v_signal_action := 'not_provided';
    v_signal_verified := true;
    v_message := 'No stable signal profile was provided; UID was verified.';
  elsif v_card.signal_fingerprint = v_fp then
    update public.rfid_cards
    set last_signal_verified_at = p_scanned_at,
        signal_verify_count = coalesce(signal_verify_count, 0) + 1,
        updated_at = now()
    where id = v_card.id;
    v_signal_action := 'verified';
    v_signal_verified := true;
    v_message := 'Signal profile verified.';
  else
    insert into public.attendance_scan_events (
      device_id, rfid_card_id, student_id, rfid_uid, scanned_at,
      signal_profile, signal_fingerprint, verification_status, verification_message
    ) values (
      v_device.id, v_card.id, v_card.student_id, v_uid, p_scanned_at,
      case when v_signal_present then p_signal_profile else null end,
      v_fp,
      'signal_mismatch',
      'RFID UID matched, but the saved signal profile did not match.'
    ) returning id into v_event_id;

    update public.rfid_cards
    set last_scanned_at = p_scanned_at, updated_at = now()
    where id = v_card.id;

    return query select 'signal_mismatch', v_event_id, null::uuid, null::public.attendance_type,
      null::public.attendance_status, v_card.student_id, (select full_name from public.students where id = v_card.student_id), 'mismatch', false,
      'Card signal verification failed.';
    return;
  end if;

  select * into v_settings from public.school_settings where id = 1;
  if v_settings.id is null then
    raise exception 'School attendance settings have not been configured by Super Admin';
  end if;

  select exists (
    select 1 from public.attendance_records
    where student_id = v_card.student_id and attendance_date = v_today
      and attendance_type = 'entry'
  ) into v_has_entry;

  v_type := case when v_has_entry then 'exit'::public.attendance_type else 'entry'::public.attendance_type end;
  v_status := case
    when v_type = 'entry' and (p_scanned_at at time zone 'Asia/Colombo')::time > v_settings.late_after_time
      then 'late'::public.attendance_status
    else 'present'::public.attendance_status
  end;

  -- Record ONE raw scan event regardless of daily duplicate rules.
  insert into public.attendance_scan_events (
    device_id, rfid_card_id, student_id, rfid_uid, scanned_at,
    signal_profile, signal_fingerprint, verification_status,
    verification_message, attendance_type, attendance_status
  ) values (
    v_device.id, v_card.id, v_card.student_id, v_uid, p_scanned_at,
    case when v_signal_present then p_signal_profile else null end,
    v_fp,
    case when v_signal_action = 'enrolled' then 'signal_enrolled' else 'verified' end,
    v_message, v_type, v_status
  ) returning id into v_event_id;

  -- Preserve the existing logical daily attendance model. Every physical scan
  -- is saved above, even if this insert is blocked by the existing uniqueness.
  if v_card.last_scanned_at is not null
     and p_scanned_at - v_card.last_scanned_at
       < make_interval(secs => v_settings.duplicate_scan_window_seconds) then
    update public.attendance_scan_events
    set verification_status = case when v_signal_action = 'enrolled' then 'signal_enrolled_duplicate' else 'duplicate_blocked' end,
        verification_message = 'Raw scan saved; logical attendance duplicate window blocked a new attendance record.'
    where id = v_event_id;

    update public.rfid_cards set last_scanned_at = p_scanned_at, updated_at = now() where id = v_card.id;
    update public.attendance_devices set last_scan_at = p_scanned_at, status = 'online', updated_at = now() where id = v_device.id;

    return query select 'duplicate_blocked', v_event_id, null::uuid, v_type, v_status,
      v_card.student_id, (select full_name from public.students where id = v_card.student_id), v_signal_action, v_signal_verified,
      'Scan saved in history; duplicate attendance record was blocked.';
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
    set verification_status = case when v_signal_action = 'enrolled' then 'signal_enrolled_duplicate' else 'duplicate_blocked' end,
        verification_message = 'Raw scan saved; an attendance record for this type already exists.',
        attendance_record_id = null
    where id = v_event_id;
  else
    update public.attendance_scan_events
    set attendance_record_id = v_new_id
    where id = v_event_id;
  end if;

  update public.rfid_cards set last_scanned_at = p_scanned_at, updated_at = now() where id = v_card.id;
  update public.attendance_devices set last_scan_at = p_scanned_at, status = 'online', updated_at = now() where id = v_device.id;

  if v_new_id is null then
    return query select 'duplicate_blocked', v_event_id, null::uuid, v_type, v_status,
      v_card.student_id, (select full_name from public.students where id = v_card.student_id), v_signal_action, v_signal_verified,
      'Scan saved; an attendance record for this type already exists.';
  else
    return query select 'ok', v_event_id, v_new_id, v_type, v_status,
      v_card.student_id, (select full_name from public.students where id = v_card.student_id), v_signal_action, v_signal_verified, v_message;
  end if;
end;
$$;

revoke all on function public.process_rfid_scan_with_signal(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.process_rfid_scan_with_signal(text, text, timestamptz, jsonb) to service_role;


-- Realtime: allow the Live Attendance page to receive every new raw scan.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance_scan_events'
  ) then
    execute 'alter publication supabase_realtime add table public.attendance_scan_events';
  end if;
exception when undefined_object then
  -- Some projects do not expose the realtime publication; the table still works.
  null;
end $$;

commit;
