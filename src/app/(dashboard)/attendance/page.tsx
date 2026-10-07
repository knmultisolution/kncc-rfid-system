"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Badge, statusTone } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { ClipboardList, Search, Loader2, Pencil, ScanLine, ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import toast from "react-hot-toast";
import type { AttendanceRecord, AttendanceScanEvent, Profile } from "@/types";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";

export default function AttendancePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [scanEvents, setScanEvents] = useState<AttendanceScanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"attendance" | "scans">("attendance");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("");
  const [detailTarget, setDetailTarget] = useState<AttendanceScanEvent | null>(null);
  const [editTarget, setEditTarget] = useState<AttendanceRecord | null>(null);
  const [editStatus, setEditStatus] = useState("present");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: me }, { data, error }, { data: events, error: eventError }] = await Promise.all([
      supabase.auth.getUser().then(async ({ data }) => data.user ? supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle() : { data: null }),
      supabase.from("attendance_records").select("*, student:students(full_name, index_number, grade:grades(name), division:divisions(name)), device:attendance_devices(device_name)").eq("attendance_date", date).order("scan_time", { ascending: false }),
      supabase.from("attendance_scan_events").select("*, student:students(full_name, index_number), device:attendance_devices(device_name)").gte("scanned_at", `${date}T00:00:00+05:30`).lt("scanned_at", `${date}T23:59:59+05:30`).order("scanned_at", { ascending: false }),
    ]);
    if (error) toast.error(error.message);
    if (eventError) toast.error(eventError.message);
    setProfile(me as Profile | null); setRecords((data as AttendanceRecord[]) ?? []); setScanEvents((events as AttendanceScanEvent[]) ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, [date]);
  const isSuperAdmin = profile?.role === "super_admin";

  const filteredRecords = useMemo(() => records.filter((r) => { const q=search.trim().toLowerCase(); return (!q || r.student?.full_name.toLowerCase().includes(q) || r.student?.index_number.toLowerCase().includes(q)) && (!statusFilter || r.status===statusFilter); }), [records, search, statusFilter]);
  const filteredScans = useMemo(() => scanEvents.filter((r) => { const q=search.trim().toLowerCase(); const hay=[r.rfid_uid, r.student?.full_name, r.student?.index_number, r.verification_status, r.signal_fingerprint].filter(Boolean).join(" ").toLowerCase(); return (!q || hay.includes(q)) && (!verificationFilter || r.verification_status===verificationFilter); }), [scanEvents, search, verificationFilter]);

  const present = records.filter((r) => r.status === "present").length;
  const late = records.filter((r) => r.status === "late").length;
  const verifiedScans = scanEvents.filter((r) => ["verified","signal_enrolled"].includes(r.verification_status)).length;
  const invalidScans = scanEvents.filter((r) => ["card_invalid","signal_mismatch"].includes(r.verification_status)).length;

  function openEdit(r: AttendanceRecord) { setEditTarget(r); setEditStatus(r.status); setEditReason(""); }
  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault(); if (!editTarget) return; setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("attendance_records").update({ status: editStatus, is_manual_edit: true, edited_by: userData.user?.id ?? null, edit_reason: editReason || null }).eq("id", editTarget.id);
    setSaving(false); if (error) { toast.error(error.message); return; }
    toast.success("Attendance record updated"); setEditTarget(null); load();
  }

  return <div>
    <PageHeader title="Attendance & Scan Activity" description="Logical attendance records and every physical RFID scan are stored separately for easy review." />

    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Attendance Records" value={records.length} icon={ClipboardList} tone="info" />
      <StatCard label="Raw Scans" value={scanEvents.length} icon={ScanLine} tone="default" />
      <StatCard label="Verified Scans" value={verifiedScans} icon={ShieldCheck} tone="success" />
      <StatCard label="Invalid / Mismatch" value={invalidScans} icon={ShieldAlert} tone="danger" />
    </div>

    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <button onClick={() => setTab("attendance")} className={tab === "attendance" ? "btn-primary" : "btn-outline"}>Attendance</button>
      <button onClick={() => setTab("scans")} className={tab === "scans" ? "btn-primary" : "btn-outline"}>Scan Activity</button>
      <input type="date" className="input sm:w-48" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder={tab === "attendance" ? "Search student name or index…" : "Search UID, student, result, or fingerprint…"} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {tab === "attendance" ? <select className="input sm:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select> : <select className="input sm:w-52" value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value)}><option value="">All scan results</option><option value="signal_enrolled">Signal enrolled</option><option value="verified">Verified</option><option value="duplicate_blocked">Duplicate blocked</option><option value="card_invalid">Card invalid</option><option value="signal_mismatch">Signal mismatch</option></select>}
    </div>

    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div> : tab === "attendance" ? (
      filteredRecords.length === 0 ? <EmptyState icon={ClipboardList} title="No attendance records" description={`No logical attendance records for ${formatDate(date)}.`} /> : <div className="card overflow-x-auto"><div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-400">Showing {filteredRecords.length} of {records.length} attendance records</div><table className="w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50"><tr><th className="w-10 px-4 py-3 text-center">#</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Signal</th><th className="px-4 py-3">Device</th>{isSuperAdmin && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredRecords.map((r, rowIndex) => <tr key={r.id}>
<td className="px-4 py-3 text-center text-xs text-slate-400">{rowIndex + 1}</td><td className="px-4 py-3"><p className="font-medium">{r.student?.full_name}</p><p className="text-xs text-slate-400">{r.student?.index_number}</p></td><td className="px-4 py-3"><Badge tone="slate">{r.attendance_type}</Badge></td><td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td><td className="px-4 py-3 text-slate-500">{formatTime(r.scan_time)}</td><td className="px-4 py-3">{r.signal_fingerprint ? <Badge tone="success">Verified</Badge> : <Badge tone="slate">—</Badge>}</td><td className="px-4 py-3 text-slate-500">{r.device?.device_name ?? "—"}</td>{isSuperAdmin && <td className="px-4 py-3 text-right"><button onClick={() => openEdit(r)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button></td>}</tr>)}</tbody></table></div>
    ) : (
      filteredScans.length === 0 ? <EmptyState icon={ScanLine} title="No scan activity" description={`No RFID scans for ${formatDate(date)}.`} /> : <div className="card overflow-x-auto"><div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-400">Showing {filteredScans.length} of {scanEvents.length} physical scans</div><table className="w-full text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50"><tr><th className="w-10 px-4 py-3 text-center">#</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">UID</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Signal</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3">Details</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredScans.map((r, rowIndex) => <tr key={r.id}>
<td className="px-4 py-3 text-center text-xs text-slate-400">{rowIndex + 1}</td><td className="px-4 py-3 text-slate-500">{formatTime(r.scanned_at)}</td><td className="px-4 py-3 font-mono text-xs">{r.rfid_uid}</td><td className="px-4 py-3">{r.student?.full_name ?? "Unknown / Unregistered"}<div className="text-xs text-slate-400">{r.student?.index_number ?? "—"}</div></td><td className="px-4 py-3"><Badge tone={r.verification_status.includes("invalid") || r.verification_status.includes("mismatch") ? "red" : r.verification_status.includes("duplicate") ? "amber" : "green"}>{r.verification_status}</Badge></td><td className="px-4 py-3">{r.signal_fingerprint ? <Badge tone="success">Matched / stored</Badge> : <Badge tone="slate">No profile</Badge>}</td><td className="px-4 py-3">{r.attendance_type ? <span>{r.attendance_type} · {r.attendance_status}</span> : "—"}</td><td className="px-4 py-3"><button onClick={() => setDetailTarget(r)} className="text-xs font-medium text-brand-600 hover:underline">View</button></td></tr>)}</tbody></table></div>
    )}

    <Modal open={!!detailTarget} onClose={() => setDetailTarget(null)} title="Scan Details">{detailTarget && <div className="space-y-3 text-sm"><div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-400">Scanned</p><p>{formatDateTime(detailTarget.scanned_at)}</p></div><div><p className="text-xs text-slate-400">UID</p><p className="font-mono">{detailTarget.rfid_uid}</p></div><div><p className="text-xs text-slate-400">Result</p><p>{detailTarget.verification_status}</p></div><div><p className="text-xs text-slate-400">Attendance</p><p>{detailTarget.attendance_type ?? "—"}</p></div></div><div><p className="text-xs text-slate-400">Message</p><p>{detailTarget.verification_message ?? "—"}</p></div><div><p className="text-xs text-slate-400">Signal profile</p><pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-200">{JSON.stringify(detailTarget.signal_profile ?? {}, null, 2)}</pre></div><div><p className="text-xs text-slate-400">Signal fingerprint</p><p className="break-all font-mono text-xs">{detailTarget.signal_fingerprint ?? "—"}</p></div></div>}</Modal>

    <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Attendance Record"><form onSubmit={handleEditSave} className="space-y-4"><div><p className="label">Student</p><p className="text-sm">{editTarget?.student?.full_name} ({editTarget?.student?.index_number})</p></div><div><label className="label">Status</label><select className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></div><div><label className="label">Reason for edit</label><textarea className="input" rows={2} value={editReason} onChange={(e) => setEditReason(e.target.value)} /></div><div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</button></div></form></Modal>
  </div>;
}
