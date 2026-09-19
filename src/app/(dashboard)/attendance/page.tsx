"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Badge, statusTone } from "@/components/ui/badge";
import { ClipboardList, Search, Loader2, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import type { AttendanceRecord, Profile } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";

export default function AttendancePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [editTarget, setEditTarget] = useState<AttendanceRecord | null>(null);
  const [editStatus, setEditStatus] = useState("present");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: me }, { data, error }] = await Promise.all([
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return { data: null };
        return supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      }),
      supabase
        .from("attendance_records")
        .select("*, student:students(full_name, index_number, grade:grades(name), division:divisions(name)), device:attendance_devices(device_name)")
        .eq("attendance_date", date)
        .order("scan_time", { ascending: false }),
    ]);
    if (error) toast.error(error.message);
    setProfile(me as Profile | null);
    setRecords((data as AttendanceRecord[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const isSuperAdmin = profile?.role === "super_admin";

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.student?.full_name.toLowerCase().includes(q) ||
        r.student?.index_number.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [records, search, statusFilter]);

  function openEdit(r: AttendanceRecord) {
    setEditTarget(r);
    setEditStatus(r.status);
    setEditReason("");
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("attendance_records")
      .update({
        status: editStatus,
        is_manual_edit: true,
        edited_by: userData.user?.id ?? null,
        edit_reason: editReason || null,
      })
      .eq("id", editTarget.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Attendance record updated");
    setEditTarget(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Browse attendance records by date. Super Admins can correct individual records."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input type="date" className="input sm:w-48" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by student name or index number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No attendance records for this date"
          description="Once RFID devices start capturing scans, entry and exit records for the selected date will appear here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching records" description="Try adjusting your search or filters." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Edited</th>
                {isSuperAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{r.student?.full_name}</p>
                    <p className="text-xs text-slate-400">{r.student?.index_number}</p>
                  </td>
                  <td className="px-4 py-3"><Badge tone="slate">{r.attendance_type}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{formatTime(r.scan_time)}</td>
                  <td className="px-4 py-3 text-slate-500">{r.device?.device_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{r.is_manual_edit ? <Badge tone="amber">Edited</Badge> : "—"}</td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(r)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Attendance Record">
        <form onSubmit={handleEditSave} className="space-y-4">
          <div>
            <p className="label">Student</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{editTarget?.student?.full_name} ({editTarget?.student?.index_number})</p>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </select>
          </div>
          <div>
            <label className="label">Reason for edit</label>
            <textarea className="input" rows={2} value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="e.g. Device misread, corrected after review" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
