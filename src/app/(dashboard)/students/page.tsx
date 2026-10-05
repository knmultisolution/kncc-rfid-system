"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, statusTone } from "@/components/ui/badge";
import { Users, Plus, Pencil, Trash2, Loader2, Search, Upload, Download, CreditCard, ScanLine, Unplug, Eye, FileSpreadsheet } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import type { Student, SchoolClass, Profile } from "@/types";
import { formatDate } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import { downloadCsv, downloadText, firstValue, parseCsv } from "@/lib/csv";

export default function StudentsPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rfidConnected, setRfidConnected] = useState(false);
  const [rfidScanning, setRfidScanning] = useState(false);
  const [rfidPort, setRfidPort] = useState<any>(null);
  const [rfidReader, setRfidReader] = useState<any>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [viewTarget, setViewTarget] = useState<Student | null>(null);
  const [importing, setImporting] = useState(false);

  const emptyForm = {
    student_code: "",
    index_number: "",
    full_name: "",
    class_id: "",
    rfid_uid: "",
    status: "active",
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    const [{ data: me }, { data: s, error }, { data: c }] = await Promise.all([
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return { data: null };
        return supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      }),
      supabase
        .from("students")
        .select("*, grade:grades(*), division:divisions(*), class:classes(*, grade:grades(*), division:divisions(*)), rfid_cards(*)")
        .order("created_at", { ascending: false }),
      supabase.from("classes").select("*, grade:grades(*), division:divisions(*)").order("created_at"),
    ]);
    if (error) toast.error(error.message);
    setProfile(me as Profile | null);
    setStudents((s as Student[]) ?? []);
    setClasses((c as SchoolClass[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();

    return () => {
      void disconnectRfidReader();
    };
  }, []);

  function normalizeUid(value: string) {
    return value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  }

  function isValidUid(value: string) {
    return /^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(value);
  }

  function captureUidFromSerialLine(line: string) {
    const raw = line.trim();
    if (!raw || raw === "RFID_READY") return false;
    if (!/^[0-9a-fA-F][0-9a-fA-F:\s-]*$/.test(raw)) return false;

    const uid = normalizeUid(raw);
    if (!isValidUid(uid)) return false;

    setForm((current) => ({ ...current, rfid_uid: uid }));
    setRfidScanning(false);
    toast.success(`RFID UID captured: ${uid}`);
    return true;
  }

  async function readRfidSerial(port: any, reader: any) {
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          if (captureUidFromSerialLine(rawLine.trim())) {
            try {
              await reader.cancel();
            } catch {}
            return;
          }
        }
      }
    } catch (error) {
      if (rfidScanning) {
        toast.error(error instanceof Error ? error.message : "RFID reader disconnected.");
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {}
      setRfidReader(null);
      setRfidConnected(false);
      setRfidScanning(false);
      try {
        if (port?.readable?.locked === false) await port.close();
      } catch {}
      setRfidPort(null);
    }
  }

  async function connectRfidReader() {
    const serial = (navigator as any).serial;
    if (!serial) {
      toast.error("Web Serial is not supported in this browser. Use Chrome or Edge over HTTPS.");
      return;
    }

    try {
      if (rfidPort) {
        setRfidScanning(true);
        toast.success("RFID reader connected. Scan a card now.");
        return;
      }

      const port = await serial.requestPort();
      await port.open({ baudRate: 115200 });
      const reader = port.readable?.getReader();
      if (!reader) {
        await port.close();
        throw new Error("The RFID reader serial stream is not available.");
      }

      setRfidPort(port);
      setRfidReader(reader);
      setRfidConnected(true);
      setRfidScanning(true);
      toast.success("RFID reader connected. Scan a card now.");
      void readRfidSerial(port, reader);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect to the RFID reader.");
      setRfidConnected(false);
      setRfidScanning(false);
    }
  }

  async function disconnectRfidReader() {
    const reader = rfidReader;
    const port = rfidPort;
    setRfidScanning(false);

    if (reader) {
      try {
        await reader.cancel();
      } catch {}
    }

    if (port) {
      try {
        if (port.readable?.locked === false) await port.close();
      } catch {}
    }

    setRfidReader(null);
    setRfidPort(null);
    setRfidConnected(false);
  }

  const isSuperAdmin = profile?.role === "super_admin";

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        s.index_number.toLowerCase().includes(q) ||
        s.student_code.toLowerCase().includes(q) ||
        s.rfid_cards?.some((card) => card.rfid_uid.toLowerCase().includes(q));
      const matchesClass = !classFilter || s.class_id === classFilter;
      const matchesStatus = !statusFilter || s.status === statusFilter;
      return matchesSearch && matchesClass && matchesStatus;
    });
  }, [students, search, classFilter, statusFilter]);

  function openCreate() {
    void disconnectRfidReader();
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(s: Student) {
    void disconnectRfidReader();
    const activeCard = s.rfid_cards?.find((card) => card.status === "active") ?? s.rfid_cards?.[0];
    setEditing(s);
    setForm({
      student_code: s.student_code,
      index_number: s.index_number,
      full_name: s.full_name,
      class_id: s.class_id ?? "",
      rfid_uid: activeCard?.rfid_uid ?? "",
      status: s.status,
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const normalizedUid = normalizeUid(form.rfid_uid);
    if (normalizedUid && !isValidUid(normalizedUid)) {
      setSaving(false);
      toast.error("RFID UID must be 8, 14, or 20 hexadecimal characters.");
      return;
    }

    const payload: any = {
      student_code: form.student_code.trim(),
      index_number: form.index_number.trim(),
      full_name: form.full_name.trim(),
      class_id: form.class_id || null,
      status: form.status,
    };

    if (!editing && normalizedUid) {
      const { data: existingCard, error: cardLookupError } = await supabase
        .from("rfid_cards")
        .select("id, student_id")
        .eq("rfid_uid", normalizedUid)
        .maybeSingle();

      if (cardLookupError) {
        setSaving(false);
        toast.error(cardLookupError.message);
        return;
      }
      if (existingCard) {
        setSaving(false);
        toast.error("This RFID UID is already registered to another card.");
        return;
      }
    }

    if (editing) {
      const { error } = await supabase.from("students").update(payload).eq("id", editing.id);
      if (error) {
        setSaving(false);
        if (error.message.includes("index_number")) toast.error("This index number is already in use.");
        else if (error.message.includes("student_code")) toast.error("This Student ID is already in use.");
        else toast.error(error.message);
        return;
      }

      const currentCard = editing.rfid_cards?.find((card) => card.status === "active") ?? editing.rfid_cards?.[0];

      if (normalizedUid) {
        if (!currentCard) {
          const { error: cardError } = await supabase.from("rfid_cards").insert({
            rfid_uid: normalizedUid,
            student_id: editing.id,
            status: "active",
            registered_at: new Date().toISOString(),
          });
          if (cardError) {
            setSaving(false);
            toast.error(cardError.message.includes("unique") ? "This RFID UID is already in use." : cardError.message);
            return;
          }
        } else if (normalizeUid(currentCard.rfid_uid) !== normalizedUid) {
          const { data: newCard, error: newCardError } = await supabase
            .from("rfid_cards")
            .insert({
              rfid_uid: normalizedUid,
              student_id: editing.id,
              status: "active",
              registered_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (newCardError) {
            setSaving(false);
            toast.error(newCardError.message.includes("unique") ? "This RFID UID is already in use." : newCardError.message);
            return;
          }

          const { error: replaceError } = await supabase
            .from("rfid_cards")
            .update({
              status: "replaced",
              disabled_at: new Date().toISOString(),
              replaced_card_id: newCard.id,
            })
            .eq("id", currentCard.id);

          if (replaceError) {
            setSaving(false);
            toast.error(replaceError.message);
            return;
          }
        } else if (currentCard.status !== "active") {
          const { error: reactivateError } = await supabase
            .from("rfid_cards")
            .update({ status: "active", disabled_at: null })
            .eq("id", currentCard.id);

          if (reactivateError) {
            setSaving(false);
            toast.error(reactivateError.message);
            return;
          }
        }
      }
    } else {
      const { data: newStudent, error } = await supabase
        .from("students")
        .insert(payload)
        .select("id")
        .single();

      if (error || !newStudent) {
        setSaving(false);
        if (error?.message.includes("index_number")) toast.error("This index number is already in use.");
        else if (error?.message.includes("student_code")) toast.error("This Student ID is already in use.");
        else toast.error(error?.message ?? "Could not add student.");
        return;
      }

      if (normalizedUid) {
        const { error: cardError } = await supabase.from("rfid_cards").insert({
          rfid_uid: normalizedUid,
          student_id: newStudent.id,
          status: "active",
          registered_at: new Date().toISOString(),
        });

        if (cardError) {
          setSaving(false);
          toast.error(cardError.message.includes("unique") ? "Student added, but this RFID UID is already in use." : cardError.message);
          setModalOpen(false);
          await load();
          return;
        }
      }
    }

    setSaving(false);
    toast.success(editing ? "Student updated" : normalizedUid ? "Student added with RFID card" : "Student added");
    setModalOpen(false);
    await disconnectRfidReader();
    load();
  }

  function exportStudentsCsv(all = false) {
    const rows = (all ? students : filtered).map((student) => {
      const card = student.rfid_cards?.find((c) => c.status === "active") ?? student.rfid_cards?.[0];
      return {
        student_code: student.student_code,
        index_number: student.index_number,
        full_name: student.full_name,
        class: student.class ? `${student.grade?.name ?? ""} - ${student.division?.name ?? ""}` : "",
        class_id: student.class_id ?? "",
        rfid_uid: card?.rfid_uid ?? "",
        status: student.status,
      };
    });
    downloadCsv(`KNCC_students_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success(`${rows.length} student records exported.`);
  }

  function downloadStudentTemplate() {
    downloadText(
      "KNCC_students_import_template.csv",
      "student_code,index_number,full_name,class,class_id,rfid_uid,status\r\nSTU001,001,Example Student,Grade 10 - A,,A1B2C3D4,active\r\n",
      "text/csv;charset=utf-8",
    );
  }

  async function importStudentsCsv(file: File) {
    setImporting(true);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("CSV file is empty.");
      const classByLabel = new Map(classes.map((c) => [`${c.grade?.name ?? ""} - ${c.division?.name ?? ""}`.toLowerCase(), c]));
      const classById = new Map(classes.map((c) => [c.id, c]));
      const byCode = new Map(students.map((x) => [x.student_code.toLowerCase(), x]));
      const byIndex = new Map(students.map((x) => [x.index_number.toLowerCase(), x]));
      let inserted = 0;
      let updated = 0;
      let cards = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const studentCode = firstValue(row, "student_code", "student id", "student_id", "student code");
        const indexNumber = firstValue(row, "index_number", "index no", "index number");
        const fullName = firstValue(row, "full_name", "name", "student name");
        if (!studentCode || !indexNumber || !fullName) {
          errors.push(`Row ${i + 2}: student_code, index_number and full_name are required.`);
          continue;
        }
        const classIdRaw = firstValue(row, "class_id");
        const classLabel = firstValue(row, "class", "class_name").toLowerCase();
        const classItem = classIdRaw ? classById.get(classIdRaw) : classByLabel.get(classLabel);
        if ((classIdRaw || classLabel) && !classItem) {
          errors.push(`Row ${i + 2}: class could not be matched. Use the exact class label or class_id from Export CSV.`);
          continue;
        }
        const status = firstValue(row, "status") || "active";
        const existing = byCode.get(studentCode.toLowerCase()) ?? byIndex.get(indexNumber.toLowerCase());
        const payload = { student_code: studentCode, index_number: indexNumber, full_name: fullName, class_id: classItem?.id ?? null, status };

        let studentId = existing?.id;
        if (existing) {
          const { error } = await supabase.from("students").update(payload).eq("id", existing.id);
          if (error) { errors.push(`Row ${i + 2}: ${error.message}`); continue; }
          updated += 1;
          studentId = existing.id;
        } else {
          const { data, error } = await supabase.from("students").insert(payload).select("id").single();
          if (error || !data) { errors.push(`Row ${i + 2}: ${error?.message ?? "student insert failed"}`); continue; }
          inserted += 1;
          studentId = data.id;
        }

        const uid = normalizeUid(firstValue(row, "rfid_uid", "rfid", "uid", "rfid card"));
        if (uid && studentId) {
          const { data: existingCard, error: cardLookupError } = await supabase.from("rfid_cards").select("id, student_id").eq("rfid_uid", uid).maybeSingle();
          if (cardLookupError) { errors.push(`Row ${i + 2}: ${cardLookupError.message}`); continue; }
          if (existingCard && existingCard.student_id !== studentId) { errors.push(`Row ${i + 2}: RFID UID ${uid} already belongs to another student.`); continue; }
          if (existingCard) {
            await supabase.from("rfid_cards").update({ student_id: studentId, status: "active" }).eq("id", existingCard.id);
          } else {
            const { error } = await supabase.from("rfid_cards").insert({ rfid_uid: uid, student_id: studentId, status: "active", registered_at: new Date().toISOString() });
            if (error) { errors.push(`Row ${i + 2}: ${error.message}`); continue; }
          }
          cards += 1;
        }
      }
      if (errors.length) toast.error(`${errors.length} row(s) need attention. First: ${errors[0]}`);
      toast.success(`Import finished: ${inserted} added, ${updated} updated, ${cards} RFID links.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import CSV.");
    } finally {
      setImporting(false);
    }
  }

  function openView(student: Student) {
    setViewTarget(student);
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


  return (
    <div>
      <PageHeader
        title="Students"
        description="Fast search, quick student details, RFID linking, CSV import/export, and simple counts."
        action={
          isSuperAdmin ? (
            <div className="flex gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void importStudentsCsv(file);
                }}
              />
              <button className="btn-outline" onClick={() => importInputRef.current?.click()} disabled={importing}>
                <Upload className="h-4 w-4" /> {importing ? "Importing…" : "Import CSV"}
              </button>
              <button className="btn-outline" onClick={() => exportStudentsCsv(false)}>
                <Download className="h-4 w-4" /> Export CSV
              </button>
              <button className="btn-outline" title="Download a blank import template" onClick={downloadStudentTemplate}>
                <FileSpreadsheet className="h-4 w-4" /> Template
              </button>
              <button className="btn-primary" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add Student
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Students" value={students.length} icon={Users} tone="info" />
        <StatCard label="Active" value={students.filter((s) => s.status === "active").length} icon={Users} tone="success" />
        <StatCard label="With RFID" value={students.filter((s) => s.rfid_cards?.some((c) => c.status === "active")).length} icon={CreditCard} tone="default" />
        <StatCard label="No RFID" value={students.filter((s) => !s.rfid_cards?.some((c) => c.status === "active")).length} icon={CreditCard} tone="warning" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, index number, student ID, or RFID UID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-56" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.grade?.name} - {c.division?.name}</option>)}
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
          description="Add your first student to start tracking attendance. Select the student's class and assign an RFID card."
          actionHref={isSuperAdmin ? "#" : undefined}
          actionLabel={isSuperAdmin ? "" : undefined}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching students" description="Try adjusting your search or filters." />
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>Showing {filtered.length} of {students.length} students</span>
            <span>{search.trim() ? "Search active" : "Ready"}</span>
          </div>
          <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="w-12 px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Index No.</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">RFID Card</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((s, rowIndex) => {
                const card = s.rfid_cards?.[0];
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-center text-xs text-slate-400">{rowIndex + 1}</td>
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
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{card.rfid_uid}</span>
                          <span><Badge tone={statusTone(card.status)}>{card.status}</Badge></span>
                        </div>
                      ) : (
                        <Link href="/rfid-cards" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                          <CreditCard className="h-3.5 w-3.5" /> Assign card
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(s.registration_date)}</td>
                    <td className="px-4 py-3 text-right">
                      <button title="View student details" onClick={() => openView(s)} className="mr-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Eye className="h-4 w-4" /></button>
                      {isSuperAdmin && <><button title="Edit student" onClick={() => openEdit(s)} className="mr-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                      <button title="Delete student" onClick={() => setDeleteTarget(s)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button></>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          void disconnectRfidReader();
          setModalOpen(false);
        }}
        title={editing ? "Edit Student" : "Add Student"}
        maxWidth="max-w-2xl"
      >
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
          <div className="sm:col-span-2">
            <label className="label">Class</label>
            <select className="input" required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">Select class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.grade?.name} - {c.division?.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-400">Grade and division are taken automatically from the selected class.</p>
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

          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 dark:border-brand-900/60 dark:bg-brand-950/20 sm:col-span-2">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <label className="label mb-1">RFID UID</label>
                <p className="text-xs text-slate-500 dark:text-slate-400">Connect the ESP32 + RC522 reader, then scan the student card. The UID will fill automatically.</p>
              </div>
              {rfidConnected && (
                <button type="button" className="btn-outline shrink-0" onClick={() => void disconnectRfidReader()}>
                  <Unplug className="h-4 w-4" /> Disconnect
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="input flex-1 font-mono uppercase"
                value={form.rfid_uid}
                onChange={(e) => setForm({ ...form, rfid_uid: normalizeUid(e.target.value) })}
                placeholder="Example: 3A7DAF16"
                inputMode="text"
                autoCapitalize="characters"
              />
              <button
                type="button"
                className="btn-primary whitespace-nowrap"
                onClick={() => void connectRfidReader()}
                disabled={rfidConnected && rfidScanning}
              >
                {rfidScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                {rfidScanning ? "Scan Card Now" : "Connect RFID Reader"}
              </button>
            </div>
            <div className="mt-2 text-xs">
              {rfidConnected ? (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">Reader connected — scan one card now.</span>
              ) : (
                <span className="text-slate-400">Manual UID entry is also available.</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                void disconnectRfidReader();
                setModalOpen(false);
              }}
            >Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Student"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="Student Details">
        {viewTarget && (() => {
          const activeCard = viewTarget.rfid_cards?.find((c) => c.status === "active") ?? viewTarget.rfid_cards?.[0];
          return (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs text-slate-400">Student ID</p><p className="font-medium">{viewTarget.student_code}</p></div>
              <div><p className="text-xs text-slate-400">Index Number</p><p className="font-medium">{viewTarget.index_number}</p></div>
              <div className="sm:col-span-2"><p className="text-xs text-slate-400">Full Name</p><p className="font-medium">{viewTarget.full_name}</p></div>
              <div><p className="text-xs text-slate-400">Class</p><p>{viewTarget.grade?.name ?? "—"} {viewTarget.division?.name ?? ""}</p></div>
              <div><p className="text-xs text-slate-400">Status</p><Badge tone={statusTone(viewTarget.status)}>{viewTarget.status}</Badge></div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-400">Active RFID</p>
                {activeCard ? <p className="font-mono text-sm">{activeCard.rfid_uid}</p> : <p className="text-slate-400">No active RFID linked</p>}
              </div>
              <div><p className="text-xs text-slate-400">Signal Profile</p><p>{activeCard?.signal_fingerprint ? "Enrolled & verified" : "Waiting for first signal scan"}</p></div>
              <div><p className="text-xs text-slate-400">Signal Verifications</p><p>{activeCard?.signal_verify_count ?? 0}</p></div>
            </div>
          );
        })()}
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
