"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import { FileBarChart, Loader2, Printer, Search } from "lucide-react";
import toast from "react-hot-toast";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ReportTab = "daily" | "monthly" | "grade" | "class" | "student";

const TABS: { key: ReportTab; label: string }[] = [
  { key: "daily", label: "Daily Attendance" },
  { key: "monthly", label: "Monthly Attendance" },
  { key: "grade", label: "Grade-wise" },
  { key: "class", label: "Class-wise" },
  { key: "student", label: "Student Summary" },
];

export default function ReportsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<ReportTab>("daily");
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [grades, setGrades] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const [dailyRows, setDailyRows] = useState<any[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<any[]>([]);
  const [gradeRows, setGradeRows] = useState<any[]>([]);
  const [classRows, setClassRows] = useState<any[]>([]);
  const [studentRows, setStudentRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: g }, { data: c }, { data: s }] = await Promise.all([
        supabase.from("grades").select("*").order("display_order"),
        supabase.from("classes").select("*, grade:grades(*), division:divisions(*)").order("created_at"),
        supabase.from("students").select("id, full_name, index_number").order("full_name"),
      ]);
      setGrades(g ?? []);
      setClasses(c ?? []);
      setStudents(s ?? []);
    })();
  }, []);

  async function runReport() {
    setLoading(true);
    try {
      if (tab === "daily") {
        const { data, error } = await supabase
          .from("attendance_records")
          .select("*, student:students(full_name, index_number, grade:grades(name), division:divisions(name))")
          .eq("attendance_date", date)
          .order("scan_time");
        if (error) throw error;
        setDailyRows(data ?? []);
      } else if (tab === "monthly") {
        const start = `${month}-01`;
        const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0).toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from("attendance_records")
          .select("attendance_date, status, student_id, student:students(full_name, index_number)")
          .gte("attendance_date", start)
          .lte("attendance_date", end);
        if (error) throw error;
        const byStudent = new Map<string, any>();
        for (const r of data ?? []) {
          const key = r.student_id;
          if (!byStudent.has(key)) {
            byStudent.set(key, { student: r.student, present: 0, late: 0, days: new Set() });
          }
          const entry = byStudent.get(key);
          entry.days.add(r.attendance_date);
          if (r.status === "present") entry.present += 1;
          if (r.status === "late") entry.late += 1;
        }
        setMonthlyRows(Array.from(byStudent.values()).map((v) => ({ ...v, daysPresent: v.days.size })));
      } else if (tab === "grade") {
        const { data, error } = await supabase
          .from("attendance_records")
          .select("status, student:students(grade_id, grade:grades(name))")
          .eq("attendance_date", date);
        if (error) throw error;
        const byGrade = new Map<string, { name: string; present: number; late: number }>();
        for (const r of data ?? []) {
          const gName = (r.student as any)?.grade?.name ?? "Unassigned";
          if (!byGrade.has(gName)) byGrade.set(gName, { name: gName, present: 0, late: 0 });
          const entry = byGrade.get(gName)!;
          if (r.status === "present") entry.present += 1;
          if (r.status === "late") entry.late += 1;
        }
        setGradeRows(Array.from(byGrade.values()));
      } else if (tab === "class") {
        const { data, error } = await supabase
          .from("attendance_records")
          .select("status, student:students(class_id, grade:grades(name), division:divisions(name))")
          .eq("attendance_date", date);
        if (error) throw error;
        const byClass = new Map<string, { name: string; present: number; late: number }>();
        for (const r of data ?? []) {
          const grade = (r.student as any)?.grade?.name ?? "?";
          const division = (r.student as any)?.division?.name ?? "?";
          const label = `${grade} - ${division}`;
          if (!byClass.has(label)) byClass.set(label, { name: label, present: 0, late: 0 });
          const entry = byClass.get(label)!;
          if (r.status === "present") entry.present += 1;
          if (r.status === "late") entry.late += 1;
        }
        setClassRows(Array.from(byClass.values()));
      } else if (tab === "student" && selectedStudentId) {
        const { data, error } = await supabase
          .from("attendance_records")
          .select("*")
          .eq("student_id", selectedStudentId)
          .order("attendance_date", { ascending: false })
          .limit(60);
        if (error) throw error;
        setStudentRows(data ?? []);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, date, month, selectedStudentId]);

  const hasData = useMemo(() => {
    if (tab === "daily") return dailyRows.length > 0;
    if (tab === "monthly") return monthlyRows.length > 0;
    if (tab === "grade") return gradeRows.length > 0;
    if (tab === "class") return classRows.length > 0;
    if (tab === "student") return studentRows.length > 0;
    return false;
  }, [tab, dailyRows, monthlyRows, gradeRows, classRows, studentRows]);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Daily, monthly, grade-wise, class-wise, and per-student attendance reports."
        action={
          <button className="btn-outline" onClick={() => window.print()} disabled={!hasData}>
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 print:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-400" : "text-slate-600 hover:text-slate-900 dark:text-slate-300"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        {(tab === "daily" || tab === "grade" || tab === "class") && (
          <input type="date" className="input w-48" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
        {tab === "monthly" && <input type="month" className="input w-48" value={month} onChange={(e) => setMonth(e.target.value)} />}
        {tab === "student" && (
          <select className="input sm:w-72" value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
            <option value="">Select a student...</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.index_number}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : tab === "student" && !selectedStudentId ? (
        <EmptyState icon={Search} title="Select a student" description="Choose a student above to view their attendance summary." />
      ) : !hasData ? (
        <EmptyState icon={FileBarChart} title="No report data for this selection" description="Once attendance is recorded for the selected period, the report will appear here." />
      ) : (
        <div className="card overflow-x-auto p-1">
          {tab === "daily" && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dailyRows.map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{r.student?.full_name} <span className="text-xs text-slate-400">({r.student?.index_number})</span></td>
                    <td className="px-4 py-3 text-slate-500">{r.student?.grade?.name} {r.student?.division?.name}</td>
                    <td className="px-4 py-3"><Badge tone="slate">{r.attendance_type}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "monthly" && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Days Present</th><th className="px-4 py-3">On Time</th><th className="px-4 py-3">Late</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {monthlyRows.map((r: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3">{r.student?.full_name} <span className="text-xs text-slate-400">({r.student?.index_number})</span></td>
                    <td className="px-4 py-3">{r.daysPresent}</td>
                    <td className="px-4 py-3">{r.present}</td>
                    <td className="px-4 py-3">{r.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "grade" && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Late</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {gradeRows.map((r: any, i: number) => (
                  <tr key={i}><td className="px-4 py-3">{r.name}</td><td className="px-4 py-3">{r.present}</td><td className="px-4 py-3">{r.late}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "class" && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr><th className="px-4 py-3">Class</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Late</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {classRows.map((r: any, i: number) => (
                  <tr key={i}><td className="px-4 py-3">{r.name}</td><td className="px-4 py-3">{r.present}</td><td className="px-4 py-3">{r.late}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "student" && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {studentRows.map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{formatDate(r.attendance_date)}</td>
                    <td className="px-4 py-3"><Badge tone="slate">{r.attendance_type}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
