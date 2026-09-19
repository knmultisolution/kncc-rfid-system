"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, statusTone } from "@/components/ui/badge";
import { Users, Plus, Pencil, Trash2, Loader2, Search, Upload, Download, CreditCard } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import type { Student, Grade, Division, SchoolClass, Profile } from "@/types";
import { formatDate } from "@/lib/utils";

export default function StudentsPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  const emptyForm = {
    student_code: "",
    index_number: "",
    full_name: "",
    grade_id: "",
    division_id: "",
    class_id: "",
    gender: "",
    date_of_birth: "",
    guardian_name: "",
    guardian_phone: "",
    address: "",
    status: "active",
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    const [{ data: me }, { data: s, error }, { data: g }, { data: d }, { data: c }] = await Promise.all([
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return { data: null };
        return supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      }),
      supabase
        .from("students")
        .select("*, grade:grades(*), division:divisions(*), class:classes(*), rfid_cards(*)")
        .order("created_at", { ascending: false }),
      supabase.from("grades").select("*").order("display_order"),
      supabase.from("divisions").select("*").order("name"),
      supabase.from("classes").select("*, grade:grades(*), division:divisions(*)").order("created_at"),
    ]);
    if (error) toast.error(error.message);
    setProfile(me as Profile | null);
    setStudents((s as Student[]) ?? []);
    setGrades((g as Grade[]) ?? []);
    setDivisions((d as Division[]) ?? []);
    setClasses((c as SchoolClass[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const isSuperAdmin = profile?.role === "super_admin";

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        s.index_number.toLowerCase().includes(q) ||
        s.student_code.toLowerCase().includes(q);
      const matchesGrade = !gradeFilter || s.grade_id === gradeFilter;
      const matchesStatus = !statusFilter || s.status === statusFilter;
      return matchesSearch && matchesGrade && matchesStatus;
    });
  }, [students, search, gradeFilter, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(s: Student) {
    setEditing(s);
    setForm({
      student_code: s.student_code,
      index_number: s.index_number,
      full_name: s.full_name,
      grade_id: s.grade_id ?? "",
      division_id: s.division_id ?? "",
      class_id: s.class_id ?? "",
      gender: s.gender ?? "",
      date_of_birth: s.date_of_birth ?? "",
      guardian_name: s.guardian_name ?? "",
      guardian_phone: s.guardian_phone ?? "",
      address: s.address ?? "",
      status: s.status,
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: any = {
      student_code: form.student_code.trim(),
      index_number: form.index_number.trim(),
      full_name: form.full_name.trim(),
      grade_id: form.grade_id || null,
      division_id: form.division_id || null,
      class_id: form.class_id || null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      guardian_name: form.guardian_name.trim() || null,
      guardian_phone: form.guardian_phone.trim() || null,
      address: form.address.trim() || null,
      status: form.status,
    };

    const { error } = editing
      ? await supabase.from("students").update(payload).eq("id", editing.id)
      : await supabase.from("students").insert(payload);

    setSaving(false);
    if (error) {
      if (error.message.includes("index_number")) toast.error("This index number is already in use.");
      else if (error.message.includes("student_code")) toast.error("This Student ID is already in use.");
      else toast.error(error.message);
      return;
    }
    toast.success(editing ? "Student updated" : "Student added");
    setModalOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("students").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Student removed");
    setDeleteTarget(null);
    load();
  }

  const classesForGrade = classes.filter((c) => !form.grade_id || c.grade_id === form.grade_id);

  return (
    <div>
      <PageHeader
        title="Students"
        description="Manage the student roster, class assignment, and status."
        action={
          isSuperAdmin ? (
            <div className="flex gap-2">
              <button className="btn-outline" title="Import/export structure — connect to your data pipeline" disabled>
                <Upload className="h-4 w-4" /> Import
              </button>
              <button className="btn-outline" title="Export current list" disabled>
                <Download className="h-4 w-4" /> Export
              </button>
              <button className="btn-primary" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add Student
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, index number, or student ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-48" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          <option value="">All grades</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select className="input sm:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="transferred">Transferred</option>
          <option value="graduated">Graduated</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students added yet"
          description="Add your first student to start tracking attendance. Set up grades, divisions, and classes first for smoother data entry."
          actionHref={isSuperAdmin ? "#" : undefined}
          actionLabel={isSuperAdmin ? "" : undefined}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching students" description="Try adjusting your search or filters." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Index No.</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">RFID Card</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Registered</th>
                {isSuperAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((s) => {
                const card = s.rfid_cards?.[0];
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{s.full_name}</p>
                      <p className="text-xs text-slate-400">{s.student_code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.index_number}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {s.class ? `${s.grade?.name ?? ""} - ${s.division?.name ?? ""}` : "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      {card ? (
                        <Badge tone={statusTone(card.status)}>{card.status}</Badge>
                      ) : (
                        <Link href="/rfid-cards" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                          <CreditCard className="h-3.5 w-3.5" /> Assign card
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(s.registration_date)}</td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(s)} className="mr-2 rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteTarget(s)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Student" : "Add Student"} maxWidth="max-w-2xl">
        <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Student ID</label>
            <input className="input" required value={form.student_code} onChange={(e) => setForm({ ...form, student_code: e.target.value })} placeholder="e.g. KNCC-2026-001" />
          </div>
          <div>
            <label className="label">Index Number</label>
            <input className="input" required value={form.index_number} onChange={(e) => setForm({ ...form, index_number: e.target.value })} placeholder="e.g. 5821" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Full name</label>
            <input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Grade</label>
            <select className="input" value={form.grade_id} onChange={(e) => setForm({ ...form, grade_id: e.target.value, class_id: "" })}>
              <option value="">Select grade</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Division</label>
            <select className="input" value={form.division_id} onChange={(e) => setForm({ ...form, division_id: e.target.value })}>
              <option value="">Select division</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Class</label>
            <select className="input" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">Unassigned</option>
              {classesForGrade.map((c) => <option key={c.id} value={c.id}>{c.grade?.name} - {c.division?.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Date of birth</label>
            <input type="date" className="input" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="transferred">Transferred</option>
              <option value="graduated">Graduated</option>
            </select>
          </div>
          <div>
            <label className="label">Guardian name</label>
            <input className="input" value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Guardian phone</label>
            <input className="input" value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
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
        title="Delete student"
        description={`Are you sure you want to remove "${deleteTarget?.full_name}"? Their attendance history and RFID card link will also be removed.`}
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
