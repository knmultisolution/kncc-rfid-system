"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BookOpen, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { SchoolClass, Grade, Division, Profile } from "@/types";

export default function ClassesPage() {
  const supabase = createClient();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [gradeId, setGradeId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [room, setRoom] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SchoolClass | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: c, error }, { data: g }, { data: d }, { data: t }] = await Promise.all([
      supabase.from("classes").select("*, grade:grades(*), division:divisions(*)").order("created_at"),
      supabase.from("grades").select("*").order("display_order"),
      supabase.from("divisions").select("*").order("name"),
      supabase.from("profiles").select("*").eq("role", "teacher").eq("status", "approved").order("full_name"),
    ]);
    if (error) toast.error(error.message);
    setClasses((c as SchoolClass[]) ?? []);
    setGrades((g as Grade[]) ?? []);
    setDivisions((d as Division[]) ?? []);
    setTeachers((t as Profile[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setGradeId("");
    setDivisionId("");
    setTeacherId("");
    setRoom("");
    setModalOpen(true);
  }

  function openEdit(c: SchoolClass) {
    setEditing(c);
    setGradeId(c.grade_id);
    setDivisionId(c.division_id);
    setTeacherId(c.class_teacher_id ?? "");
    setRoom(c.room ?? "");
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      grade_id: gradeId,
      division_id: divisionId,
      class_teacher_id: teacherId || null,
      room: room.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("classes").update(payload).eq("id", editing.id)
      : await supabase.from("classes").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "This grade + division combination already exists." : error.message);
      return;
    }
    toast.success(editing ? "Class updated" : "Class added");
    setModalOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("classes").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error("Cannot delete: students or assignments still reference this class.");
      return;
    }
    toast.success("Class deleted");
    setDeleteTarget(null);
    load();
  }

  const canCreate = grades.length > 0 && divisions.length > 0;

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Combine a grade and division into a class, and assign a class teacher."
        action={
          canCreate ? (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Class
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : !canCreate ? (
        <EmptyState icon={BookOpen} title="Add grades and divisions first" description="You need at least one grade and one division before you can create classes." actionHref="/grades" actionLabel="Go to Grades" />
      ) : classes.length === 0 ? (
        <EmptyState icon={BookOpen} title="No classes added yet" description="Create your first class by combining a grade and a division." actionHref="#" actionLabel="" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Class Teacher</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {classes.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {c.grade?.name} - {c.division?.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.room ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {teachers.find((t) => t.id === c.class_teacher_id)?.full_name ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(c)} className="mr-2 rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteTarget(c)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Class" : "Add Class"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Grade</label>
            <select className="input" required value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              <option value="">Select grade</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Division</label>
            <select className="input" required value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
              <option value="">Select division</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Class Teacher (optional)</label>
            <select className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Unassigned</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            {teachers.length === 0 && (
              <p className="mt-1 text-xs text-slate-400">No approved teacher accounts yet — approve one from Users first.</p>
            )}
          </div>
          <div>
            <label className="label">Room (optional)</label>
            <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Room 12" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete class"
        description="Are you sure you want to delete this class? This cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
