"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Plus, Loader2, Trash2, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import type { Profile, SchoolClass, Grade } from "@/types";

const PERMISSION_MATRIX: { feature: string; superAdmin: boolean; principal: boolean; sectionalHead: boolean; teacher: boolean }[] = [
  { feature: "View dashboard & live attendance", superAdmin: true, principal: true, sectionalHead: true, teacher: true },
  { feature: "View all students / attendance / reports", superAdmin: true, principal: true, sectionalHead: false, teacher: false },
  { feature: "View assigned grades/classes only", superAdmin: false, principal: false, sectionalHead: true, teacher: true },
  { feature: "Add / edit / delete students", superAdmin: true, principal: false, sectionalHead: false, teacher: false },
  { feature: "Manage RFID cards & devices", superAdmin: true, principal: false, sectionalHead: false, teacher: false },
  { feature: "Add comments", superAdmin: true, principal: true, sectionalHead: true, teacher: true },
  { feature: "Edit attendance records", superAdmin: true, principal: false, sectionalHead: false, teacher: false },
  { feature: "Download reports", superAdmin: true, principal: true, sectionalHead: true, teacher: true },
  { feature: "Manage users & roles", superAdmin: true, principal: false, sectionalHead: false, teacher: false },
  { feature: "View audit logs & settings", superAdmin: true, principal: false, sectionalHead: false, teacher: false },
];

export default function RolesPermissionsPage() {
  const supabase = createClient();
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [heads, setHeads] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<any[]>([]);
  const [headAssignments, setHeadAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [assignModal, setAssignModal] = useState<"teacher" | "head" | null>(null);
  const [form, setForm] = useState({ profile_id: "", class_id: "", grade_id: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: profiles }, { data: c }, { data: g }, { data: ta }, { data: sha }] = await Promise.all([
      supabase.from("profiles").select("*").eq("status", "approved").in("role", ["teacher", "sectional_head"]),
      supabase.from("classes").select("*, grade:grades(*), division:divisions(*)").order("created_at"),
      supabase.from("grades").select("*").order("display_order"),
      supabase.from("teacher_assignments").select("*, teacher:profiles(*), class:classes(*, grade:grades(*), division:divisions(*))"),
      supabase.from("sectional_head_assignments").select("*, sectional_head:profiles(*), grade:grades(*), class:classes(*, grade:grades(*), division:divisions(*))"),
    ]);
    setTeachers(((profiles as Profile[]) ?? []).filter((p) => p.role === "teacher"));
    setHeads(((profiles as Profile[]) ?? []).filter((p) => p.role === "sectional_head"));
    setClasses((c as SchoolClass[]) ?? []);
    setGrades((g as Grade[]) ?? []);
    setTeacherAssignments(ta ?? []);
    setHeadAssignments(sha ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openAssign(kind: "teacher" | "head") {
    setAssignModal(kind);
    setForm({ profile_id: "", class_id: "", grade_id: "" });
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (assignModal === "teacher") {
      const { error } = await supabase.from("teacher_assignments").insert({ teacher_id: form.profile_id, class_id: form.class_id });
      setSaving(false);
      if (error) {
        toast.error(error.message.includes("unique") ? "This teacher is already assigned to this class." : error.message);
        return;
      }
      toast.success("Teacher assigned");
    } else {
      const { error } = await supabase.from("sectional_head_assignments").insert({
        sectional_head_id: form.profile_id,
        grade_id: form.grade_id || null,
        class_id: form.class_id || null,
      });
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Sectional Head assigned");
    }
    setAssignModal(null);
    load();
  }

  async function removeTeacherAssignment(id: string) {
    const { error } = await supabase.from("teacher_assignments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Assignment removed");
    load();
  }

  async function removeHeadAssignment(id: string) {
    const { error } = await supabase.from("sectional_head_assignments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Assignment removed");
    load();
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Reference for what each role can access, plus scoping Teachers and Sectional Heads to classes or grades."
      />

      <div className="card mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3">Capability</th>
              <th className="px-4 py-3 text-center">Super Admin</th>
              <th className="px-4 py-3 text-center">Principal</th>
              <th className="px-4 py-3 text-center">Sectional Head</th>
              <th className="px-4 py-3 text-center">Teacher</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {PERMISSION_MATRIX.map((row) => (
              <tr key={row.feature}>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{row.feature}</td>
                {[row.superAdmin, row.principal, row.sectionalHead, row.teacher].map((v, i) => (
                  <td key={i} className="px-4 py-3 text-center">
                    {v ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <X className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-700" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Teacher → Class Assignments</h3>
              <button className="btn-outline" onClick={() => openAssign("teacher")} disabled={!teachers.length || !classes.length}>
                <Plus className="h-4 w-4" /> Assign
              </button>
            </div>
            {teacherAssignments.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No teacher assignments yet" description="Assign teachers to their classes so they only see their own students." />
            ) : (
              <div className="space-y-2">
                {teacherAssignments.map((a) => (
                  <div key={a.id} className="card flex items-center justify-between p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{a.teacher?.full_name}</p>
                      <p className="text-xs text-slate-400">{a.class?.grade?.name} - {a.class?.division?.name}</p>
                    </div>
                    <button onClick={() => removeTeacherAssignment(a.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sectional Head Scopes</h3>
              <button className="btn-outline" onClick={() => openAssign("head")} disabled={!heads.length}>
                <Plus className="h-4 w-4" /> Assign
              </button>
            </div>
            {headAssignments.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No Sectional Head scopes yet" description="Scope Sectional Heads to a grade or specific class." />
            ) : (
              <div className="space-y-2">
                {headAssignments.map((a) => (
                  <div key={a.id} className="card flex items-center justify-between p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{a.sectional_head?.full_name}</p>
                      <p className="text-xs text-slate-400">
                        {a.class ? `${a.class.grade?.name} - ${a.class.division?.name}` : a.grade ? `All of ${a.grade.name}` : "—"}
                      </p>
                    </div>
                    <button onClick={() => removeHeadAssignment(a.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={assignModal === "teacher" ? "Assign Teacher to Class" : "Assign Sectional Head"}>
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="label">{assignModal === "teacher" ? "Teacher" : "Sectional Head"}</label>
            <select className="input" required value={form.profile_id} onChange={(e) => setForm({ ...form, profile_id: e.target.value })}>
              <option value="">Select user</option>
              {(assignModal === "teacher" ? teachers : heads).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          {assignModal === "teacher" ? (
            <div>
              <label className="label">Class</label>
              <select className="input" required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
                <option value="">Select class</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.grade?.name} - {c.division?.name}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Grade (whole grade scope)</label>
                <select className="input" value={form.grade_id} onChange={(e) => setForm({ ...form, grade_id: e.target.value, class_id: "" })}>
                  <option value="">None</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Or a single class</label>
                <select className="input" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value, grade_id: "" })}>
                  <option value="">None</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.grade?.name} - {c.division?.name}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setAssignModal(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
