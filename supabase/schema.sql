-- KNCC RFID Attendance System: base schema
-- Run this FIRST (after supabase-schema-preflight.sql, which creates the enum
-- types), then run supabase-security-upgrade.sql. Creates every table, index,
-- Row Level Security policy, and the process_rfid_scan attendance engine.
-- Inserts NO data - every table starts empty.

begin;

-- ---------------------------------------------------------------------------
-- Enums (safe to re-run; supabase-schema-preflight.sql also creates these)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('super_admin', 'principal', 'sectional_head', 'teacher');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('pending', 'approved', 'rejected', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.student_status as enum ('active', 'inactive', 'transferred', 'graduated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.card_status as enum ('unregistered', 'active', 'disabled', 'lost', 'replaced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'late', 'absent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_type as enum ('entry', 'exit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sync_status as enum ('synced', 'pending', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.device_status as enum ('online', 'offline', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender_type as enum ('male', 'female', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role public.user_role,
  status public.account_status not null default 'pending',
  is_first_super_admin boolean not null default false,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  requested_role public.user_role,
  note text,
  status public.account_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grades (id) on delete cascade,
  division_id uuid not null references public.divisions (id) on delete cascade,
  class_teacher_id uuid references public.profiles (id),
  room text,
  created_at timestamptz not null default now(),
  unique (grade_id, division_id)
);

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id)
);

create table if not exists public.sectional_head_assignments (
  id uuid primary key default gen_random_uuid(),
  sectional_head_id uuid not null references public.profiles (id) on delete cascade,
  grade_id uuid not null references public.grades (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sectional_head_id, grade_id)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,
  index_number text not null unique,
  full_name text not null,
  grade_id uuid references public.grades (id),
  division_id uuid references public.divisions (id),
  class_id uuid references public.classes (id),
  gender public.gender_type,
  date_of_birth date,
  guardian_name text,
  guardian_phone text,
  address text,
  status public.student_status not null default 'active',
  registration_date date not null default current_date,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rfid_cards (
  id uuid primary key default gen_random_uuid(),
  rfid_uid text not null unique,
  student_id uuid references public.students (id) on delete set null,
  status public.card_status not null default 'unregistered',
  registered_at timestamptz,
  disabled_at timestamptz,
  replaced_card_id uuid references public.rfid_cards (id),
  last_scanned_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  device_name text not null,
  location text,
  status public.device_status not null default 'unknown',
  firmware_version text,
  ip_address text,
  last_heartbeat_at timestamptz,
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_heartbeats (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.attendance_devices (id) on delete cascade,
  pending_records integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  rfid_card_id uuid references public.rfid_cards (id),
  device_id uuid references public.attendance_devices (id),
  attendance_date date not null,
  scan_time timestamptz not null,
  attendance_type public.attendance_type not null,
  status public.attendance_status not null,
  sync_status public.sync_status not null default 'synced',
  is_manual_edit boolean not null default false,
  edited_by uuid references public.profiles (id),
  edit_reason text,
  created_at timestamptz not null default now(),
  unique (student_id, attendance_date, attendance_type)
);

create table if not exists public.attendance_sync_queue (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.attendance_devices (id),
  rfid_uid text not null,
  scanned_at timestamptz not null,
  sync_status public.sync_status not null default 'pending',
  processed_attendance_id uuid references public.attendance_records (id),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists public.school_settings (
  id integer primary key default 1,
  school_name text not null default 'KN/Kilinochchi Central College',
  school_start_time time not null default '07:30',
  late_after_time time not null default '07:45',
  school_end_time time not null default '13:30',
  entry_exit_cutover_time time not null default '11:00',
  duplicate_scan_window_seconds integer not null default 60,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  constraint school_settings_singleton check (id = 1)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_students_class on public.students (class_id);
create index if not exists idx_students_grade on public.students (grade_id);
create index if not exists idx_students_division on public.students (division_id);
create index if not exists idx_rfid_cards_student on public.rfid_cards (student_id);
create index if not exists idx_attendance_records_student_date on public.attendance_records (student_id, attendance_date);
create index if not exists idx_attendance_records_date on public.attendance_records (attendance_date);
create index if not exists idx_comments_student on public.comments (student_id);
create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);
create index if not exists idx_teacher_assignments_teacher on public.teacher_assignments (teacher_id);
create index if not exists idx_sectional_head_assignments_head on public.sectional_head_assignments (sectional_head_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;
alter table public.grades enable row level security;
alter table public.divisions enable row level security;
alter table public.classes enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.sectional_head_assignments enable row level security;
alter table public.students enable row level security;
alter table public.rfid_cards enable row level security;
alter table public.attendance_devices enable row level security;
alter table public.device_heartbeats enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_sync_queue enable row level security;
alter table public.comments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.school_settings enable row level security;

-- Helper predicate used inline throughout: an approved user with any role.
-- (Recreated per-policy below because policies can't share helper functions
-- across ALTER POLICY boundaries cleanly without an extra function; kept
-- inline for clarity and to avoid an extra security-definer function.)

-- profiles: everyone approved can read all profiles (needed for staff lists,
-- comment authorship, etc). A user can update only their own row via the
-- update_my_profile() RPC (defined in supabase-security-upgrade.sql), never
-- directly. Only Super Admin can change role/status directly.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists profiles_super_admin_write on public.profiles;
create policy profiles_super_admin_write
  on public.profiles for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved')
  );

-- access_requests: Super Admin manages; a user can see their own request.
drop policy if exists access_requests_select on public.access_requests;
create policy access_requests_select
  on public.access_requests for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved')
  );

drop policy if exists access_requests_super_admin_write on public.access_requests;
create policy access_requests_super_admin_write
  on public.access_requests for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- grades / divisions / classes: every approved user can read; only Super
-- Admin can write.
drop policy if exists grades_select on public.grades;
create policy grades_select on public.grades for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists grades_write on public.grades;
create policy grades_write on public.grades for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

drop policy if exists divisions_select on public.divisions;
create policy divisions_select on public.divisions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists divisions_write on public.divisions;
create policy divisions_write on public.divisions for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists classes_write on public.classes;
create policy classes_write on public.classes for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- teacher_assignments / sectional_head_assignments: readable by any approved
-- user (needed for scoping), writable only by Super Admin.
drop policy if exists teacher_assignments_select on public.teacher_assignments;
create policy teacher_assignments_select on public.teacher_assignments for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists teacher_assignments_write on public.teacher_assignments;
create policy teacher_assignments_write on public.teacher_assignments for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

drop policy if exists sectional_head_assignments_select on public.sectional_head_assignments;
create policy sectional_head_assignments_select on public.sectional_head_assignments for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists sectional_head_assignments_write on public.sectional_head_assignments;
create policy sectional_head_assignments_write on public.sectional_head_assignments for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- students: every approved user can read (Teachers/Sectional Heads are
-- scoped to their assigned classes/grades in the UI query layer); only
-- Super Admin can insert/update/delete.
drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists students_write on public.students;
create policy students_write on public.students for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- rfid_cards: read by any approved user; write by Super Admin only.
drop policy if exists rfid_cards_select on public.rfid_cards;
create policy rfid_cards_select on public.rfid_cards for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists rfid_cards_write on public.rfid_cards;
create policy rfid_cards_write on public.rfid_cards for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- attendance_devices / device_heartbeats: Super Admin only (device API
-- routes use the service-role key and bypass RLS entirely).
drop policy if exists attendance_devices_all on public.attendance_devices;
create policy attendance_devices_all on public.attendance_devices for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

drop policy if exists device_heartbeats_all on public.device_heartbeats;
create policy device_heartbeats_all on public.device_heartbeats for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- attendance_records: read by any approved user; manual edits restricted to
-- Super Admin (device API inserts via service-role key, bypassing RLS).
drop policy if exists attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists attendance_records_write on public.attendance_records;
create policy attendance_records_write on public.attendance_records for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- attendance_sync_queue: Super Admin only (device API uses service-role key).
drop policy if exists attendance_sync_queue_all on public.attendance_sync_queue;
create policy attendance_sync_queue_all on public.attendance_sync_queue for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- comments: every approved user (incl. Teachers) can read and post; the
-- author or a Super Admin can delete.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null)
  );
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved')
  );

-- audit_logs: Super Admin can read; inserts happen only via the audit.ts
-- server-side helper using the service-role key (browser insert policy is
-- intentionally dropped in supabase-security-upgrade.sql).
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- school_settings: policies are (re)created in
-- supabase-security-upgrade.sql / supabase-branding-and-access-upgrade.sql
-- if you use it; a minimal baseline here keeps the app usable on its own.
drop policy if exists school_settings_select on public.school_settings;
create policy school_settings_select on public.school_settings for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role is not null));
drop policy if exists school_settings_write on public.school_settings;
create policy school_settings_write on public.school_settings for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'));

-- ---------------------------------------------------------------------------
-- Realtime (Live Attendance feed + device status, per README section 3)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_records'
  ) then
    alter publication supabase_realtime add table public.attendance_records;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_devices'
  ) then
    alter publication supabase_realtime add table public.attendance_devices;
  end if;
end $$;

commit;

-- No INSERT statements for people, students, cards, devices, grades,
-- divisions, classes, attendance records, or settings exist in this script.
