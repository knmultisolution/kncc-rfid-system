"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, statusTone } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { CreditCard, Plus, Search, Loader2, RefreshCcw, Ban, History, UserPlus2, Upload, Download, ShieldCheck, ShieldAlert, Eye, FileSpreadsheet } from "lucide-react";
import toast from "react-hot-toast";
import type { RfidCard, Student } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { downloadCsv, downloadText, firstValue, parseCsv } from "@/lib/csv";

export default function RfidCardsPage() {
  const supabase = createClient();
  const [cards, setCards] = useState<RfidCard[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"register" | "replace" | "reassign">("register");
  const [target, setTarget] = useState<RfidCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ rfid_uid: "", student_id: "" });
  const [disableTarget, setDisableTarget] = useState<RfidCard | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<RfidCard | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: c, error }, { data: s }] = await Promise.all([
      supabase.from("rfid_cards").select("*, student:students(*, grade:grades(*), division:divisions(*))").order("created_at", { ascending: false }),
      supabase.from("students").select("*").eq("status", "active").order("full_name"),
    ]);
    if (error) toast.error(error.message);
    setCards((c as RfidCard[]) ?? []);
    setStudents((s as Student[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const assignedStudentIds = new Set(cards.filter((c) => c.status === "active").map((c) => c.student_id));
  const unassignedStudents = students.filter((s) => !assignedStudentIds.has(s.id));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      const haystack = [c.rfid_uid, c.student?.full_name, c.student?.index_number, c.status, c.signal_fingerprint].filter(Boolean).join(" ").toLowerCase();
      return (!q || haystack.includes(q)) && (!statusFilter || c.status === statusFilter);
    });
  }, [cards, search, statusFilter]);

  function openRegister() { setMode("register"); setTarget(null); setForm({ rfid_uid: "", student_id: "" }); setModalOpen(true); }
  function openReplace(card: RfidCard) { setMode("replace"); setTarget(card); setForm({ rfid_uid: "", student_id: card.student_id ?? "" }); setModalOpen(true); }
  function openReassign(card: RfidCard) { setMode("reassign"); setTarget(card); setForm({ rfid_uid: card.rfid_uid, student_id: "" }); setModalOpen(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const uid = form.rfid_uid.trim().toUpperCase();
    if (!/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid) && mode !== "reassign") { setSaving(false); toast.error("RFID UID must be 8, 14, or 20 hexadecimal characters."); return; }
    if (mode === "register") {
      const { error } = await supabase.from("rfid_cards").insert({ rfid_uid: uid, student_id: form.student_id || null, status: form.student_id ? "active" : "unregistered", registered_at: form.student_id ? new Date().toISOString() : null });
      setSaving(false); if (error) { toast.error(error.message.includes("unique") ? "This RFID UID is already registered." : error.message); return; }
      toast.success("RFID card registered");
    } else if (mode === "replace" && target) {
      const { data: newCard, error: insertErr } = await supabase.from("rfid_cards").insert({ rfid_uid: uid, student_id: target.student_id, status: "active", registered_at: new Date().toISOString() }).select().single();
      if (insertErr || !newCard) { setSaving(false); toast.error(insertErr?.message ?? "Could not create replacement card."); return; }
      const { error: updateErr } = await supabase.from("rfid_cards").update({ status: "replaced", disabled_at: new Date().toISOString(), replaced_card_id: newCard.id }).eq("id", target.id);
      setSaving(false); if (updateErr) { toast.error(updateErr.message); return; }
      toast.success("Card replaced");
    } else if (mode === "reassign" && target) {
      const { error } = await supabase.from("rfid_cards").update({ student_id: form.student_id || null, status: form.student_id ? "active" : "unregistered" }).eq("id", target.id);
      setSaving(false); if (error) { toast.error(error.message); return; }
      toast.success("Card reassigned");
    }
    setModalOpen(false); load();
  }

  async function handleDisable() {
    if (!disableTarget) return; setDisabling(true);
    const { error } = await supabase.from("rfid_cards").update({ status: "disabled", disabled_at: new Date().toISOString() }).eq("id", disableTarget.id);
    setDisabling(false); if (error) { toast.error(error.message); return; }
    toast.success("Card disabled"); setDisableTarget(null); load();
  }

  function exportCardsCsv() {
    downloadCsv(`KNCC_rfid_cards_${new Date().toISOString().slice(0, 10)}.csv`, filtered.map((c) => ({
      rfid_uid: c.rfid_uid,
      student_code: c.student?.student_code ?? "",
      index_number: c.student?.index_number ?? "",
      student_name: c.student?.full_name ?? "",
      status: c.status,
      signal_status: c.signal_fingerprint ? "enrolled" : "not_enrolled",
      signal_verify_count: String(c.signal_verify_count ?? 0),
      first_signal_captured_at: c.first_signal_captured_at ?? "",
      last_signal_verified_at: c.last_signal_verified_at ?? "",
      last_scanned_at: c.last_scanned_at ?? "",
    })));
    toast.success(`${filtered.length} card records exported.`);
  }

  function downloadCardTemplate() {
    downloadText("KNCC_rfid_cards_import_template.csv", "rfid_uid,student_code,index_number,status\r\nA1B2C3D4,STU001,001,active\r\n", "text/csv;charset=utf-8");
  }

  async function importCardsCsv(file: File) {
    setImporting(true);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("CSV file is empty.");
      const byCode = new Map(students.map((s) => [s.student_code.toLowerCase(), s]));
      const byIndex = new Map(students.map((s) => [s.index_number.toLowerCase(), s]));
      let added = 0; let updated = 0; const errors: string[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const uid = firstValue(row, "rfid_uid", "uid", "rfid").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
        if (!/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid)) { errors.push(`Row ${i + 2}: invalid UID.`); continue; }
        const code = firstValue(row, "student_code", "student id").toLowerCase();
        const index = firstValue(row, "index_number", "index no").toLowerCase();
        const student = byCode.get(code) ?? byIndex.get(index);
        if (!student) { errors.push(`Row ${i + 2}: student not found.`); continue; }
        const status = firstValue(row, "status") || "active";
        const { data: existing, error: lookupError } = await supabase.from("rfid_cards").select("id, student_id").eq("rfid_uid", uid).maybeSingle();
        if (lookupError) { errors.push(`Row ${i + 2}: ${lookupError.message}`); continue; }
        if (existing) {
          const { error } = await supabase.from("rfid_cards").update({ student_id: student.id, status }).eq("id", existing.id);
          if (error) errors.push(`Row ${i + 2}: ${error.message}`); else updated += 1;
        } else {
          const { error } = await supabase.from("rfid_cards").insert({ rfid_uid: uid, student_id: student.id, status, registered_at: new Date().toISOString() });
          if (error) errors.push(`Row ${i + 2}: ${error.message}`); else added += 1;
        }
      }
      if (errors.length) toast.error(`${errors.length} row(s) need attention. First: ${errors[0]}`);
      toast.success(`Import finished: ${added} added, ${updated} updated.`);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not import CSV."); }
    finally { setImporting(false); }
  }

  return <div>
    <PageHeader
      title="RFID Cards"
      description="Fast RFID search, signal verification history, CSV import/export, and easy card management."
      action={<div className="flex flex-wrap gap-2">
        <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.currentTarget.value=""; if (file) void importCardsCsv(file); }} />
        <button className="btn-outline" onClick={() => importInputRef.current?.click()} disabled={importing}><Upload className="h-4 w-4" /> {importing ? "Importing…" : "Import CSV"}</button>
        <button className="btn-outline" onClick={exportCardsCsv}><Download className="h-4 w-4" /> Export CSV</button>
        <button className="btn-outline" title="Download a blank RFID import template" onClick={downloadCardTemplate}><FileSpreadsheet className="h-4 w-4" /> Template</button>
        <button className="btn-primary" onClick={openRegister}><Plus className="h-4 w-4" /> Register Card</button>
      </div>}
    />

    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total Cards" value={cards.length} icon={CreditCard} tone="info" />
      <StatCard label="Active" value={cards.filter((c) => c.status === "active").length} icon={ShieldCheck} tone="success" />
      <StatCard label="Signal Enrolled" value={cards.filter((c) => !!c.signal_fingerprint).length} icon={ShieldCheck} tone="default" />
      <StatCard label="Needs First Scan" value={cards.filter((c) => c.status === "active" && !c.signal_fingerprint).length} icon={ShieldAlert} tone="warning" />
    </div>

    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Search UID, name, index, status, or signal fingerprint…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <select className="input sm:w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="unregistered">Unregistered</option><option value="disabled">Disabled</option><option value="lost">Lost</option><option value="replaced">Replaced</option></select>
    </div>
    <div className="mb-2 flex items-center justify-between text-xs text-slate-400"><span>Showing {filtered.length} of {cards.length} cards</span><span>{search.trim() ? "Search active" : "Ready"}</span></div>

    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div> : cards.length === 0 ? <EmptyState icon={CreditCard} title="No RFID cards registered yet" description="Register your first RFID card and link it to a student to start capturing attendance scans." /> : filtered.length === 0 ? <EmptyState icon={Search} title="No matching cards" description="Try adjusting your search or filters." /> : (
      <div className="card overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50"><tr><th className="w-12 px-4 py-3 text-center">#</th><th className="px-4 py-3">RFID UID</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Signal</th><th className="px-4 py-3">Last Scan</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.map((c, rowIndex) => <tr key={c.id}>
          <td className="px-4 py-3 text-center text-xs text-slate-400">{rowIndex + 1}</td>
          <td className="px-4 py-3 font-mono text-xs font-medium">{c.rfid_uid}</td>
          <td className="px-4 py-3">{c.student ? <><p className="font-medium">{c.student.full_name}</p><p className="text-xs text-slate-400">{c.student.student_code} · {c.student.index_number}</p></> : <span className="text-slate-400">Unassigned</span>}</td>
          <td className="px-4 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
          <td className="px-4 py-3">{c.signal_fingerprint ? <div className="flex items-center gap-2"><Badge tone="success">Verified profile</Badge><span className="text-xs text-slate-400">{c.signal_verify_count ?? 0}x</span></div> : <Badge tone="amber">Not enrolled</Badge>}</td>
          <td className="px-4 py-3 text-slate-500">{formatDateTime(c.last_scanned_at)}</td>
          <td className="px-4 py-3"><div className="flex justify-end gap-1"><button title="View card details" onClick={() => setHistoryTarget(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Eye className="h-4 w-4" /></button><button title="Reassign" onClick={() => openReassign(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><UserPlus2 className="h-4 w-4" /></button><button title="Replace" onClick={() => openReplace(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><RefreshCcw className="h-4 w-4" /></button>{c.status !== "disabled" && <button title="Disable" onClick={() => setDisableTarget(c)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Ban className="h-4 w-4" /></button>}</div></td>
        </tr>)}</tbody>
      </table></div>
    )}

    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={mode === "register" ? "Register RFID Card" : mode === "replace" ? "Replace RFID Card" : "Reassign RFID Card"}>
      <form onSubmit={handleSave} className="space-y-4">
        {mode !== "reassign" && <div><label className="label">RFID UID</label><input className="input font-mono" required value={form.rfid_uid} onChange={(e) => setForm({ ...form, rfid_uid: e.target.value })} placeholder="A1B2C3D4" /><p className="mt-1 text-xs text-slate-400">After registration, the first live attendance scan enrolls the card signal profile automatically.</p></div>}
        {mode !== "replace" && <div><label className="label">Assign to student</label><select className="input" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}><option value="">Leave unassigned</option>{(mode === "reassign" ? students : unassignedStudents).map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.index_number}</option>)}</select></div>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</button></div>
      </form>
    </Modal>

    <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title="RFID Card Details">
      {historyTarget && <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-400">UID</p><p className="font-mono">{historyTarget.rfid_uid}</p></div><div><p className="text-xs text-slate-400">Status</p><Badge tone={statusTone(historyTarget.status)}>{historyTarget.status}</Badge></div></div>
        <div><p className="text-xs text-slate-400">Student</p><p>{historyTarget.student?.full_name ?? "Unassigned"}</p><p className="text-xs text-slate-400">{historyTarget.student?.student_code ?? "—"} · {historyTarget.student?.index_number ?? "—"}</p></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"><p className="font-medium">Signal profile</p><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>State</span><span>{historyTarget.signal_fingerprint ? "Enrolled / verified" : "Not enrolled"}</span><span>First captured</span><span>{formatDateTime(historyTarget.first_signal_captured_at)}</span><span>Last verified</span><span>{formatDateTime(historyTarget.last_signal_verified_at)}</span><span>Verification count</span><span>{historyTarget.signal_verify_count ?? 0}</span><span>Fingerprint</span><span className="font-mono break-all">{historyTarget.signal_fingerprint ?? "—"}</span></div>{historyTarget.signal_profile && <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-950 p-3 text-[11px] text-slate-200">{JSON.stringify(historyTarget.signal_profile, null, 2)}</pre>}</div>
        <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-400">Registered</p><p>{formatDateTime(historyTarget.registered_at)}</p></div><div><p className="text-xs text-slate-400">Last scanned</p><p>{formatDateTime(historyTarget.last_scanned_at)}</p></div></div>
        <div className="pt-1 text-xs text-slate-400">Every physical scan is retained separately in Attendance → Scan Activity, including invalid and signal-mismatch attempts.</div>
      </div>}
    </Modal>

    <ConfirmDialog open={!!disableTarget} onClose={() => setDisableTarget(null)} onConfirm={handleDisable} title="Disable RFID card" description="A disabled card will be rejected by all devices. Its scan history remains preserved." confirmLabel="Disable" loading={disabling} />
  </div>;
}
