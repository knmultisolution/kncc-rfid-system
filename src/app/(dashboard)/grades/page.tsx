"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GraduationCap, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Grade } from "@/types";

export default function GradesPage() {
  const supabase = createClient();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [name, setName] = useState("");
  const [order, setOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Grade | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("grades").select("*").order("display_order");
    if (error) toast.error(error.message);
    setGrades((data as Grade[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setOrder(grades.length);
    setModalOpen(true);
  }

  function openEdit(g: Grade) {
    setEditing(g);
    setName(g.name);
    setOrder(g.display_order);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name: name.trim(), display_order: order };
    const { error } = editing
      ? await supabase.from("grades").update(payload).eq("id", editing.id)
      : await supabase.from("grades").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "A grade with this name already exists." : error.message);
      return;
    }
    toast.success(editing ? "Grade updated" : "Grade added");
    setModalOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("grades").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error("Cannot delete: this grade is likely used by existing classes or students.");
      return;
    }
    toast.success("Grade deleted");
    setDeleteTarget(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Grades"
        description="Manage the grade levels used across the school."
        action={
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Grade
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : grades.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No grades added yet"
          description="Add grade levels (e.g. Grade 1, Grade 2) before creating classes and students."
          actionHref="#"
          actionLabel=""
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Display Order</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {grades.map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{g.name}</td>
                  <td className="px-4 py-3 text-slate-500">{g.display_order}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(g)} className="mr-2 rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteTarget(g)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Grade" : "Add Grade"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Grade name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 6" />
          </div>
          <div>
            <label className="label">Display order</label>
            <input type="number" className="input" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
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
        title="Delete grade"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
