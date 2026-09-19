-- KNCC RFID Attendance System: schema preflight repair
-- Run this FIRST in Supabase SQL Editor, then run your full schema.sql.
-- It adds missing enum values only. It does not delete or insert data.

do $$ begin
  create type public.user_role as enum ('super_admin', 'principal', 'sectional_head', 'teacher');
exception when duplicate_object then null; end $$;
alter type public.user_role add value if not exists 'super_admin';
alter type public.user_role add value if not exists 'principal';
alter type public.user_role add value if not exists 'sectional_head';
alter type public.user_role add value if not exists 'teacher';

do $$ begin
  create type public.account_status as enum ('pending', 'approved', 'rejected', 'disabled');
exception when duplicate_object then null; end $$;
alter type public.account_status add value if not exists 'pending';
alter type public.account_status add value if not exists 'approved';
alter type public.account_status add value if not exists 'rejected';
alter type public.account_status add value if not exists 'disabled';

do $$ begin
  create type public.student_status as enum ('active', 'inactive', 'transferred', 'graduated');
exception when duplicate_object then null; end $$;
alter type public.student_status add value if not exists 'active';
alter type public.student_status add value if not exists 'inactive';
alter type public.student_status add value if not exists 'transferred';
alter type public.student_status add value if not exists 'graduated';

do $$ begin
  create type public.card_status as enum ('unregistered', 'active', 'disabled', 'lost', 'replaced');
exception when duplicate_object then null; end $$;
alter type public.card_status add value if not exists 'unregistered';
alter type public.card_status add value if not exists 'active';
alter type public.card_status add value if not exists 'disabled';
alter type public.card_status add value if not exists 'lost';
alter type public.card_status add value if not exists 'replaced';

do $$ begin
  create type public.attendance_status as enum ('present', 'late', 'absent');
exception when duplicate_object then null; end $$;
alter type public.attendance_status add value if not exists 'present';
alter type public.attendance_status add value if not exists 'late';
alter type public.attendance_status add value if not exists 'absent';

do $$ begin
  create type public.attendance_type as enum ('entry', 'exit');
exception when duplicate_object then null; end $$;
alter type public.attendance_type add value if not exists 'entry';
alter type public.attendance_type add value if not exists 'exit';

do $$ begin
  create type public.sync_status as enum ('synced', 'pending', 'failed');
exception when duplicate_object then null; end $$;
alter type public.sync_status add value if not exists 'synced';
alter type public.sync_status add value if not exists 'pending';
alter type public.sync_status add value if not exists 'failed';

do $$ begin
  create type public.device_status as enum ('online', 'offline', 'unknown');
exception when duplicate_object then null; end $$;
alter type public.device_status add value if not exists 'online';
alter type public.device_status add value if not exists 'offline';
alter type public.device_status add value if not exists 'unknown';

do $$ begin
  create type public.gender_type as enum ('male', 'female', 'other');
exception when duplicate_object then null; end $$;
alter type public.gender_type add value if not exists 'male';
alter type public.gender_type add value if not exists 'female';
alter type public.gender_type add value if not exists 'other';
