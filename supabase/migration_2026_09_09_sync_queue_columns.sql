-- =====================================================================
-- Migration: add missing columns to attendance_sync_queue
-- Safe to run anytime — ADD COLUMN IF NOT EXISTS never touches or
-- deletes any existing rows/data. Run this once in the Supabase SQL
-- Editor.
-- =====================================================================

alter table public.attendance_sync_queue
  add column if not exists attempts integer not null default 0;

alter table public.attendance_sync_queue
  add column if not exists processed_at timestamptz;
