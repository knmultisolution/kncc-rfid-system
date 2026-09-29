-- KNCC RFID Attendance System: Teacher / Sectional Head scope upgrade
-- Run this AFTER supabase/schema.sql and supabase/supabase-security-upgrade.sql.
--
-- Rules implemented here:
--   * Teacher: exactly one assigned class; access only that class.
--   * Sectional Head: exactly one assigned grade; access all classes/students in that grade.
--   * Principal: all students/attendance (unchanged).
--   * Super Admin: full access and the only role allowed to change assignments.
--
-- Existing duplicate assignments, if any, are reduced to the most recently-created
-- assignment for each user before the one-assignment indexes are created.

begin;

-- Keep one active scope assignment per staff member.
with ranked as (
  select id,
         row_number() over (partition by teacher_id order by created_at desc, id desc) as rn
  from public.teacher_assignments
)
delete from public.teacher_assignments ta
using ranked r
where ta.id = r.id and r.rn > 1;

with ranked as (
  select id,
         row_number() over (partition by sectional_head_id order by created_at desc, id desc) as rn
  from public.sectional_head_assignments
)
delete from public.sectional_head_assignments sha
using ranked r
where sha.id = r.id and r.rn > 1;

create unique index if not exists uq_teacher_one_class
  on public.teacher_assignments (teacher_id);

create unique index if not exists uq_sectional_head_one_grade
  on public.sectional_head_assignments (sectional_head_id);

-- The Sectional Head table is grade-only. Remove any legacy class linkage
-- if an older database happened to contain it.
-- (Current schema.sql does not create sectional_head_assignments.class_id.)

-- Staff can read only their own scope assignments; Super Admin can read all.
drop policy if exists teacher_assignments_select on public.teacher_assignments;
create policy teacher_assignments_select
  on public.teacher_assignments for select to authenticated
  using (
    teacher_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'super_admin'
        and p.status = 'approved'
    )
  );

drop policy if exists sectional_head_assignments_select on public.sectional_head_assignments;
create policy sectional_head_assignments_select
  on public.sectional_head_assignments for select to authenticated
  using (
    sectional_head_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'super_admin'
        and p.status = 'approved'
    )
  );

-- Classes visible to staff are limited to their assigned scope.
drop policy if exists classes_select on public.classes;
create policy classes_select
  on public.classes for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role is not null
        and (
          p.role in ('super_admin', 'principal')
          or (
            p.role = 'teacher'
            and exists (
              select 1 from public.teacher_assignments ta
              where ta.teacher_id = p.id
                and ta.class_id = public.classes.id
            )
          )
          or (
            p.role = 'sectional_head'
            and exists (
              select 1 from public.sectional_head_assignments sha
              where sha.sectional_head_id = p.id
                and sha.grade_id = public.classes.grade_id
            )
          )
        )
    )
  );

-- Grade list follows the same scope. Teachers see the grade containing their class.
drop policy if exists grades_select on public.grades;
create policy grades_select
  on public.grades for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role is not null
        and (
          p.role in ('super_admin', 'principal')
          or (
            p.role = 'sectional_head'
            and exists (
              select 1 from public.sectional_head_assignments sha
              where sha.sectional_head_id = p.id
                and sha.grade_id = public.grades.id
            )
          )
          or (
            p.role = 'teacher'
            and exists (
              select 1
              from public.teacher_assignments ta
              join public.classes c on c.id = ta.class_id
              where ta.teacher_id = p.id
                and c.grade_id = public.grades.id
            )
          )
        )
    )
  );

-- Student visibility is enforced at the database level, not only in the UI.
drop policy if exists students_select on public.students;
create policy students_select
  on public.students for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role is not null
        and (
          p.role in ('super_admin', 'principal')
          or (
            p.role = 'teacher'
            and exists (
              select 1 from public.teacher_assignments ta
              where ta.teacher_id = p.id
                and ta.class_id = public.students.class_id
            )
          )
          or (
            p.role = 'sectional_head'
            and exists (
              select 1 from public.sectional_head_assignments sha
              where sha.sectional_head_id = p.id
                and sha.grade_id = public.students.grade_id
            )
          )
        )
    )
  );

-- RFID cards are also scoped when linked to a student.
drop policy if exists rfid_cards_select on public.rfid_cards;
create policy rfid_cards_select
  on public.rfid_cards for select to authenticated
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
            where s.id = public.rfid_cards.student_id
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
        )
    )
  );

-- Attendance visibility follows the same student scope.
drop policy if exists attendance_records_select on public.attendance_records;
create policy attendance_records_select
  on public.attendance_records for select to authenticated
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
            where s.id = public.attendance_records.student_id
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
        )
    )
  );

-- Comments are visible only for students the signed-in user can access.
drop policy if exists comments_select on public.comments;
create policy comments_select
  on public.comments for select to authenticated
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
            where s.id = public.comments.student_id
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
        )
    )
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert
  on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role is not null
    )
    and exists (
      select 1 from public.students s
      where s.id = public.comments.student_id
        and (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('super_admin', 'principal')
          )
          or exists (
            select 1 from public.profiles p
            join public.teacher_assignments ta on ta.teacher_id = p.id
            where p.id = auth.uid() and p.role = 'teacher' and ta.class_id = s.class_id
          )
          or exists (
            select 1 from public.profiles p
            join public.sectional_head_assignments sha on sha.sectional_head_id = p.id
            where p.id = auth.uid() and p.role = 'sectional_head' and sha.grade_id = s.grade_id
          )
        )
    )
  );

drop policy if exists comments_delete on public.comments;
create policy comments_delete
  on public.comments for delete to authenticated
  using (
    (
      author_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'approved'
      )
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role is not null
    )
    and (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('super_admin', 'principal')
      )
      or exists (
        select 1 from public.students s
        where s.id = public.comments.student_id
          and (
            exists (
              select 1 from public.profiles p
              join public.teacher_assignments ta on ta.teacher_id = p.id
              where p.id = auth.uid() and p.role = 'teacher' and ta.class_id = s.class_id
            )
            or exists (
              select 1 from public.profiles p
              join public.sectional_head_assignments sha on sha.sectional_head_id = p.id
              where p.id = auth.uid() and p.role = 'sectional_head' and sha.grade_id = s.grade_id
            )
          )
      )
    )
  );

commit;
