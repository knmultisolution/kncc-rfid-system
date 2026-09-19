-- KNCC RFID Attendance System: branding, comments access, and instant-approval upgrade
-- Run this AFTER supabase/schema.sql and supabase/supabase-security-upgrade.sql
-- in the Supabase SQL Editor. Safe to re-run (uses IF EXISTS / IF NOT EXISTS guards).

begin;

-- 1. Logo column -------------------------------------------------------------

alter table public.school_settings
  add column if not exists school_logo_url text;

drop policy if exists school_settings_select on public.school_settings;
create policy school_settings_select
  on public.school_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists school_settings_write on public.school_settings;
create policy school_settings_write
  on public.school_settings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin' and status = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin' and status = 'approved'
    )
  );

-- 2. Storage bucket for the school logo --------------------------------------

insert into storage.buckets (id, name, public)
values ('school-assets', 'school-assets', true)
on conflict (id) do update set public = true;

drop policy if exists school_assets_public_read on storage.objects;
create policy school_assets_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'school-assets');

drop policy if exists school_assets_super_admin_write on storage.objects;
create policy school_assets_super_admin_write
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'school-assets'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin' and status = 'approved'
    )
  );

drop policy if exists school_assets_super_admin_update on storage.objects;
create policy school_assets_super_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'school-assets'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin' and status = 'approved'
    )
  );

drop policy if exists school_assets_super_admin_delete on storage.objects;
create policy school_assets_super_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'school-assets'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin' and status = 'approved'
    )
  );

-- 3. Comments: every approved user can read/post; author or Super Admin can delete ----

drop policy if exists comments_select on public.comments;
create policy comments_select
  on public.comments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'approved' and role is not null
    )
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert
  on public.comments
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'approved' and role is not null
    )
  );

drop policy if exists comments_delete on public.comments;
create policy comments_delete
  on public.comments
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin' and status = 'approved'
    )
  );

-- 4. Realtime on profiles so approval is instant, no re-login required --------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

commit;