"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { MessageSquare, Plus, Loader2, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Comment, Student, Profile } from "@/types";
import { formatDateTime, initials } from "@/lib/utils";

export default function CommentsPage() {
  const supabase = createClient();
  const [me, setMe] = useState<Profile | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ student_id: "", body: "" });
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: user }, { data: c, error }, { data: s }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("comments")
        .select("*, author:profiles(full_name), student:students(full_name, index_number)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("students").select("id, full_name, index_number, student_code").order("full_name"),
    ]);
    if (error) toast.error(error.message);
    if (user.user) {
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.user.id).maybeSingle();
      setMe(profile as Profile | null);
    }
    setComments((c as any[]) ?? []);
    setStudents((s as Student[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return comments;
    return comments.filter(
      (c: any) => c.student?.full_name?.toLowerCase().includes(q) || c.body.toLowerCase().includes(q)
    );
  }, [comments, search]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setSaving(true);
    const { error } = await supabase.from("comments").insert({
      student_id: form.student_id,
      author_id: me.id,
      body: form.body.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Comment added");
    setModalOpen(false);
    setForm({ student_id: "", body: "" });
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("comments").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Comment removed");
    setDeleteTarget(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Comments"
        description="Add attendance-related remarks or notes about a student, visible to staff who can view that student."
        action={
          <button className="btn-primary" onClick={() => setModalOpen(true)} disabled={!students.length}>
            <Plus className="h-4 w-4" /> Add Comment
          </button>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search comments or student name..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No comments yet" description="Add the first remark about a student's attendance or behavior." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching comments" description="Try a different search term." />
      ) : (
        <div className="space-y-3">
          {filtered.map((c: any) => (
            <div key={c.id} className="card flex gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-400">
                {initials(c.author?.full_name ?? "?")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{c.author?.full_name}</span>
                    <span className="text-slate-400"> on </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{c.student?.full_name}</span>
                    <span className="text-xs text-slate-400"> ({c.student?.index_number})</span>
                  </p>
                  {(c.author_id === me?.id || me?.role === "super_admin") && (
                    <button onClick={() => setDeleteTarget(c)} className="rounded p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-950">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{c.body}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(c.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Comment">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Student</label>
            <select className="input" required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
              <option value="">Select student</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.index_number}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Comment</label>
            <textarea className="input" rows={4} required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="e.g. Spoke with parent about repeated late arrivals this week." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Post
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete comment">
        <p className="text-sm text-slate-600 dark:text-slate-300">Are you sure you want to remove this comment? This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
