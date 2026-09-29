-- KNCC RFID Attendance System: production security upgrade
-- Run this AFTER supabase/schema.sql in Supabase SQL Editor.
-- This script inserts NO students, users, RFID cards, devices, or demo data.

begin;

-- Prevent two sign-ups from both becoming the first Super Admin.
create unique index if not exists uq_profiles_first_super_admin
  on public.profiles (is_first_super_admin)
  where is_first_super_admin = true;

create unique index if not exists uq_pending_access_request_per_profile
  on public.access_requests (profile_id)
  where status = 'pending';

-- A staff assignment is valid only for an approved user with the matching role.
create or replace function public.validate_assignment_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actual_role user_role;
  actual_status account_status;
begin
  if tg_table_name = 'teacher_assignments' then
    select role, status into actual_role, actual_status
    from public.profiles where id = new.teacher_id;
    if actual_role <> 'teacher' or actual_status <> 'approved' then
      raise exception 'A teacher assignment requires an approved Teacher account';
    end if;
  else
    select role, status into actual_role, actual_status
    from public.profiles where id = new.sectional_head_id;
    if actual_role <> 'sectional_head' or actual_status <> 'approved' then
      raise exception 'A sectional-head assignment requires an approved Sectional Head account';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_teacher_assignment on public.teacher_assignments;
create trigger trg_validate_teacher_assignment
before insert or update on public.teacher_assignments
for each row execute function public.validate_assignment_roles();

drop trigger if exists trg_validate_sectional_head_assignment on public.sectional_head_assignments;
create trigger trg_validate_sectional_head_assignment
before insert or update on public.sectional_head_assignments
for each row execute function public.validate_assignment_roles();

-- A student must not be assigned to a class from a different grade/division.
create or replace function public.validate_student_class_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_grade uuid;
  expected_division uuid;
begin
  if new.class_id is null then
    return new;
  end if;

  select grade_id, division_id into expected_grade, expected_division
  from public.classes where id = new.class_id;

  if expected_grade is null then
    raise exception 'Selected class does not exist';
  end if;
  if new.grade_id is not null and new.grade_id <> expected_grade then
    raise exception 'Student grade must match the selected class';
  end if;
  if new.division_id is not null and new.division_id <> expected_division then
    raise exception 'Student division must match the selected class';
  end if;

  new.grade_id := expected_grade;
  new.division_id := expected_division;
  return new;
end;
$$;

drop trigger if exists trg_validate_student_class_scope on public.students;
create trigger trg_validate_student_class_scope
before insert or update of class_id, grade_id, division_id on public.students
for each row execute function public.validate_student_class_scope();

-- First account becomes Super Admin; every later account is pending approval.
-- An advisory lock makes this safe even when two users register simultaneously.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  is_first boolean;
  requested_role_text text;
  requested_role_value user_role;
begin
  perform pg_advisory_xact_lock(hashtext('kncc-first-super-admin'));
  select not exists (select 1 from public.profiles) into is_first;

  requested_role_text := new.raw_user_meta_data ->> 'requested_role';
  if requested_role_text in ('super_admin', 'principal', 'sectional_head', 'teacher') then
    requested_role_value := requested_role_text::user_role;
  else
    requested_role_value := null;
  end if;

  insert into public.profiles (
    id, full_name, email, role, status, is_first_super_admin, approved_at
  ) values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    case when is_first then 'super_admin'::user_role else null end,
    case when is_first then 'approved'::account_status else 'pending'::account_status end,
    is_first,
    case when is_first then now() else null end
  );

  if not is_first then
    insert into public.access_requests (profile_id, requested_role, status)
    values (new.id, requested_role_value, 'pending');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Do not let normal users alter their own role, approval status, or email.
drop policy if exists profiles_update_self on public.profiles;

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Full name is required';
  end if;

  update public.profiles
  set full_name = trim(p_full_name), phone = nullif(trim(p_phone), '')
  where id = auth.uid()
  returning * into updated_profile;

  return updated_profile;
end;
$$;

-- Serialise scans for the same RFID card to protect against simultaneous readers.
-- (Access is locked down to service_role only, right after creation, below.)
create or replace function public.process_rfid_scan(
  p_rfid_uid text,
  p_device_code text,
  p_scanned_at timestamptz default now()
)
returns table (
  result text,
  attendance_id uuid,
  attendance_type attendance_type,
  attendance_status attendance_status,
  student_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.rfid_cards%rowtype;
  v_device public.attendance_devices%rowtype;
  v_settings public.school_settings%rowtype;
  v_today date := (p_scanned_at at time zone 'Asia/Colombo')::date;
  v_has_entry boolean;
  v_type attendance_type;
  v_status attendance_status;
  v_new_id uuid;
begin
  if coalesce(trim(p_rfid_uid), '') = '' or coalesce(trim(p_device_code), '') = '' then
    raise exception 'RFID UID and device code are required';
  end if;
  perform pg_advisory_xact_lock(hashtext(upper(trim(p_rfid_uid))));

  select * into v_device from public.attendance_devices
  where device_code = trim(p_device_code);
  if v_device.id is null then
    return query select 'device_unknown', null::uuid, null::attendance_type,
      null::attendance_status, null::uuid;
    return;
  end if;

  select * into v_card from public.rfid_cards
  where upper(rfid_uid) = upper(trim(p_rfid_uid));
  if v_card.id is null or v_card.status <> 'active' or v_card.student_id is null then
    return query select 'card_invalid', null::uuid, null::attendance_type,
      null::attendance_status, null::uuid;
    return;
  end if;

  select * into v_settings from public.school_settings where id = 1;
  if v_settings.id is null then
    raise exception 'School attendance settings have not been configured by Super Admin';
  end if;

  if v_card.last_scanned_at is not null
    and p_scanned_at - v_card.last_scanned_at
      < make_interval(secs => v_settings.duplicate_scan_window_seconds) then
    return query select 'duplicate_blocked', null::uuid, null::attendance_type,
      null::attendance_status, v_card.student_id;
    return;
  end if;

  select exists (
    select 1 from public.attendance_records
    where student_id = v_card.student_id and attendance_date = v_today
      and attendance_type = 'entry'
  ) into v_has_entry;

  v_type := case when v_has_entry then 'exit'::attendance_type else 'entry'::attendance_type end;
  v_status := case
    when v_type = 'entry' and (p_scanned_at at time zone 'Asia/Colombo')::time > v_settings.late_after_time
      then 'late'::attendance_status
    else 'present'::attendance_status
  end;

  insert into public.attendance_records (
    student_id, rfid_card_id, device_id, attendance_date, scan_time, attendance_type, status
  ) values (
    v_card.student_id, v_card.id, v_device.id, v_today, p_scanned_at, v_type, v_status
  ) on conflict (student_id, attendance_date, attendance_type) do nothing
  returning id into v_new_id;

  update public.rfid_cards set last_scanned_at = p_scanned_at where id = v_card.id;
  update public.attendance_devices
  set last_scan_at = p_scanned_at, status = 'online'
  where id = v_device.id;

  if v_new_id is null then
    return query select 'duplicate_blocked', null::uuid, v_type, v_status, v_card.student_id;
  else
    return query select 'ok', v_new_id, v_type, v_status, v_card.student_id;
  end if;
end;
$$;

revoke all on function public.process_rfid_scan(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.process_rfid_scan(text, text, timestamptz) to service_role;

-- Normal staff must not forge audit-log entries from the browser.
drop policy if exists audit_logs_insert on public.audit_logs;

-- Avoid accidental access to helper functions from anonymous users.
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

commit;

-- No INSERT statements for people, students, cards, devices, grades, divisions,
-- classes, attendance records, or settings exist in this migration.
