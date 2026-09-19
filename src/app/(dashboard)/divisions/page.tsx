"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Layers, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Division } from "@/types";

export default function DivisionsPage() {
  const supabase = createClient();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Division | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Division | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("divisions").select("*").order("name");
    if (error) toast.error(error.message);
    setDivisions((data as Division[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setModalOpen(true);
  }

  function openEdit(d: Division) {
    setEditing(d);
    setName(d.name);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name: name.trim() };
    const { error } = editing
      ? await supabase.from("divisions").update(payload).eq("id", editing.id)
      : await supabase.from("divisions").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "A division with this name already exists." : error.message);
      return;
    }
    toast.success(editing ? "Division updated" : "Division added");
    setModalOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("divisions").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error("Cannot delete: this division is likely used by existing classes or students.");
      return;
    }
    toast.success("Division deleted");
    setDeleteTarget(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Divisions"
        description="Manage divisions (sections) such as A, B, C used within each grade."
        action={
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Division
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : divisions.length === 0 ? (
        <EmptyState icon={Layers} title="No divisions added yet" description="Add divisions such as A, B, or C before creating classes." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {divisions.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{d.name}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(d)} className="mr-2 rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteTarget(d)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Division" : "Add Division"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Division name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. A" />
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
        title="Delete division"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
