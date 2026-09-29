"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, statusTone } from "@/components/ui/badge";
import { CreditCard, Plus, Search, Loader2, RefreshCcw, Ban, History, UserPlus2 } from "lucide-react";
import toast from "react-hot-toast";
import type { RfidCard, Student } from "@/types";
import { formatDateTime } from "@/lib/utils";

export default function RfidCardsPage() {
  const supabase = createClient();
  const [cards, setCards] = useState<RfidCard[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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
      supabase
        .from("rfid_cards")
        .select("*, student:students(*, grade:grades(*), division:divisions(*))")
        .order("created_at", { ascending: false }),
      supabase.from("students").select("*").eq("status", "active").order("full_name"),
    ]);
    if (error) toast.error(error.message);
    setCards((c as RfidCard[]) ?? []);
    setStudents((s as Student[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const assignedStudentIds = new Set(cards.filter((c) => c.status === "active").map((c) => c.student_id));
  const unassignedStudents = students.filter((s) => !assignedStudentIds.has(s.id));

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        c.rfid_uid.toLowerCase().includes(q) ||
        c.student?.full_name.toLowerCase().includes(q) ||
        c.student?.index_number.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [cards, search, statusFilter]);

  function openRegister() {
    setMode("register");
    setTarget(null);
    setForm({ rfid_uid: "", student_id: "" });
    setModalOpen(true);
  }

  function openReplace(card: RfidCard) {
    setMode("replace");
    setTarget(card);
    setForm({ rfid_uid: "", student_id: card.student_id ?? "" });
    setModalOpen(true);
  }

  function openReassign(card: RfidCard) {
    setMode("reassign");
    setTarget(card);
    setForm({ rfid_uid: card.rfid_uid, student_id: "" });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    if (mode === "register") {
      const { error } = await supabase.from("rfid_cards").insert({
        rfid_uid: form.rfid_uid.trim().toUpperCase(),
        student_id: form.student_id || null,
        status: form.student_id ? "active" : "unregistered",
        registered_at: form.student_id ? new Date().toISOString() : null,
      });
      setSaving(false);
      if (error) {
        if (error.message.includes("duplicate") || error.message.includes("unique")) {
          toast.error("This RFID UID is already registered to a card.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("RFID card registered");
    } else if (mode === "replace" && target) {
      // Disable the old card, create a new one linked to the same student
      const { data: newCard, error: insertErr } = await supabase
        .from("rfid_cards")
        .insert({
          rfid_uid: form.rfid_uid.trim().toUpperCase(),
          student_id: target.student_id,
          status: "active",
          registered_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (insertErr) {
        setSaving(false);
        toast.error(insertErr.message.includes("unique") ? "This RFID UID is already in use." : insertErr.message);
        return;
      }
      const { error: updateErr } = await supabase
        .from("rfid_cards")
        .update({ status: "replaced", disabled_at: new Date().toISOString(), replaced_card_id: newCard.id })
        .eq("id", target.id);
      setSaving(false);
      if (updateErr) {
        toast.error(updateErr.message);
        return;
      }
      toast.success("Card replaced with new RFID UID");
    } else if (mode === "reassign" && target) {
      const { error } = await supabase
        .from("rfid_cards")
        .update({ student_id: form.student_id || null, status: form.student_id ? "active" : "unregistered" })
        .eq("id", target.id);
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Card reassigned");
    }

    setModalOpen(false);
    load();
  }

  async function handleDisable() {
    if (!disableTarget) return;
    setDisabling(true);
    const { error } = await supabase
      .from("rfid_cards")
      .update({ status: "disabled", disabled_at: new Date().toISOString() })
      .eq("id", disableTarget.id);
    setDisabling(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Card disabled");
    setDisableTarget(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="RFID Cards"
        description="Register, replace, disable, and reassign student RFID cards."
        action={
          <button className="btn-primary" onClick={openRegister}>
            <Plus className="h-4 w-4" /> Register Card
          </button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by RFID UID, student name, or index number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="unregistered">Unregistered</option>
          <option value="disabled">Disabled</option>
          <option value="lost">Lost</option>
          <option value="replaced">Replaced</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No RFID cards registered yet"
          description="Register your first RFID card and link it to a student to start capturing attendance scans."
          actionHref="#"
          actionLabel=""
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching cards" description="Try adjusting your search or filters." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">RFID UID</th>
                <th className="px-4 py-3">Assigned Student</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Last Scanned</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900 dark:text-slate-100">{c.rfid_uid}</td>
                  <td className="px-4 py-3">
                    {c.student ? (
                      <>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{c.student.full_name}</p>
                        <p className="text-xs text-slate-400">{c.student.index_number}</p>
                      </>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(c.registered_at)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(c.last_scanned_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button title="Reassign" onClick={() => openReassign(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <UserPlus2 className="h-4 w-4" />
                      </button>
                      <button title="Replace" onClick={() => openReplace(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <RefreshCcw className="h-4 w-4" />
                      </button>
                      <button title="View history" onClick={() => setHistoryTarget(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <History className="h-4 w-4" />
                      </button>
                      {c.status !== "disabled" && (
                        <button title="Disable" onClick={() => setDisableTarget(c)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={mode === "register" ? "Register RFID Card" : mode === "replace" ? "Replace RFID Card" : "Reassign RFID Card"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {mode !== "reassign" && (
            <div>
              <label className="label">RFID UID</label>
              <input
                className="input font-mono"
                required
                value={form.rfid_uid}
                onChange={(e) => setForm({ ...form, rfid_uid: e.target.value })}
                placeholder="Scan or type card UID, e.g. A1B2C3D4"
              />
              <p className="mt-1 text-xs text-slate-400">
                Tip: use the &quot;RFID Registration Scan&quot; endpoint on the ESP32 to auto-fill this from a physical tap.
              </p>
            </div>
          )}
          {mode !== "replace" && (
            <div>
              <label className="label">Assign to student</label>
              <select className="input" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                <option value="">Leave unassigned</option>
                {(mode === "reassign" ? students : unassignedStudents).map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} — {s.index_number}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title="Card History">
        {historyTarget && (
          <div className="space-y-2 text-sm">
            <p><span className="text-slate-400">RFID UID:</span> <span className="font-mono">{historyTarget.rfid_uid}</span></p>
            <p><span className="text-slate-400">Status:</span> <Badge tone={statusTone(historyTarget.status)}>{historyTarget.status}</Badge></p>
            <p><span className="text-slate-400">Registered:</span> {formatDateTime(historyTarget.registered_at)}</p>
            <p><span className="text-slate-400">Disabled:</span> {formatDateTime(historyTarget.disabled_at)}</p>
            <p><span className="text-slate-400">Last scanned:</span> {formatDateTime(historyTarget.last_scanned_at)}</p>
            <p className="pt-2 text-xs text-slate-400">
              Full scan-by-scan history for this card&apos;s student is available on the Attendance page.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!disableTarget}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleDisable}
        title="Disable RFID card"
        description="A disabled card will be rejected by all devices and cannot create attendance records until re-enabled or replaced."
        confirmLabel="Disable"
        loading={disabling}
      />
    </div>
  );
}
