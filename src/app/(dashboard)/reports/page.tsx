"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import { FileBarChart, Loader2, Printer, Search, Download } from "lucide-react";
import toast from "react-hot-toast";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";

type ReportTab = "daily" | "monthly" | "grade" | "class" | "student" | "scans";
const TABS: { key: ReportTab; label: string }[] = [
  { key: "daily", label: "Daily Attendance" }, { key: "monthly", label: "Monthly Attendance" },
  { key: "grade", label: "Grade-wise" }, { key: "class", label: "Class-wise" }, { key: "student", label: "Student Summary" }, { key: "scans", label: "Scan Activity" },
];

export default function ReportsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<ReportTab>("daily");
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [dailyRows, setDailyRows] = useState<any[]>([]); const [monthlyRows, setMonthlyRows] = useState<any[]>([]); const [gradeRows, setGradeRows] = useState<any[]>([]); const [classRows, setClassRows] = useState<any[]>([]); const [studentRows, setStudentRows] = useState<any[]>([]); const [scanRows, setScanRows] = useState<any[]>([]);

  useEffect(() => { supabase.from("students").select("id, full_name, index_number, student_code").order("full_name").then(({ data }) => setStudents(data ?? [])); }, []);

  async function runReport() {
    setLoading(true);
    try {
      if (tab === "daily") {
        const { data, error } = await supabase.from("attendance_records").select("*, student:students(full_name, index_number, grade:grades(name), division:divisions(name))").eq("attendance_date", date).order("scan_time");
        if (error) throw error; setDailyRows(data ?? []);
      } else if (tab === "monthly") {
        const start = `${month}-01`; const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth()+1, 0).toISOString().slice(0,10);
        const { data, error } = await supabase.from("attendance_records").select("attendance_date, status, student_id, student:students(full_name, index_number)").gte("attendance_date", start).lte("attendance_date", end);
        if (error) throw error; const map = new Map<string, any>();
        for (const r of data ?? []) { const k=r.student_id; if(!map.has(k)) map.set(k,{student:r.student,present:0,late:0,days:new Set()}); const x=map.get(k); x.days.add(r.attendance_date); if(r.status==="present")x.present++; if(r.status==="late")x.late++; }
        setMonthlyRows(Array.from(map.values()).map((v)=>({...v,daysPresent:v.days.size})));
      } else if (tab === "grade") {
        const { data, error } = await supabase.from("attendance_records").select("status, student:students(grade:grades(name))").eq("attendance_date",date); if(error)throw error; const map=new Map<string,any>();
        for(const r of data??[]){const n=r.student?.grade?.name??"Unassigned"; if(!map.has(n))map.set(n,{name:n,present:0,late:0}); const x=map.get(n); if(r.status==="present")x.present++; if(r.status==="late")x.late++;} setGradeRows(Array.from(map.values()));
      } else if (tab === "class") {
        const { data, error } = await supabase.from("attendance_records").select("status, student:students(grade:grades(name), division:divisions(name))").eq("attendance_date",date); if(error)throw error; const map=new Map<string,any>();
        for(const r of data??[]){const n=`${r.student?.grade?.name??"?"} - ${r.student?.division?.name??"?"}`; if(!map.has(n))map.set(n,{name:n,present:0,late:0}); const x=map.get(n); if(r.status==="present")x.present++; if(r.status==="late")x.late++;} setClassRows(Array.from(map.values()));
      } else if (tab === "student" && selectedStudentId) {
        const { data, error } = await supabase.from("attendance_records").select("*").eq("student_id",selectedStudentId).order("attendance_date",{ascending:false}).limit(120); if(error)throw error; setStudentRows(data??[]);
      } else if (tab === "scans") {
        const { data, error } = await supabase.from("attendance_scan_events").select("*, student:students(full_name,index_number), device:attendance_devices(device_name)").gte("scanned_at",`${date}T00:00:00+05:30`).lt("scanned_at",`${date}T23:59:59+05:30`).order("scanned_at"); if(error)throw error; setScanRows(data??[]);
      }
    } catch (err: any) { toast.error(err.message ?? "Failed to load report"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ runReport(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },[tab,date,month,selectedStudentId]);

  const currentRows = useMemo(() => ({daily:dailyRows,monthly:monthlyRows,grade:gradeRows,class:classRows,student:studentRows,scans:scanRows}[tab] ?? []), [tab,dailyRows,monthlyRows,gradeRows,classRows,studentRows,scanRows]);
  const filteredScans = useMemo(()=>{const q=search.trim().toLowerCase(); return !q ? scanRows : scanRows.filter((r)=>[r.rfid_uid,r.student?.full_name,r.student?.index_number,r.verification_status,r.device?.device_name].filter(Boolean).join(" ").toLowerCase().includes(q));},[scanRows,search]);
  const renderRows = tab === "scans" ? filteredScans : currentRows;
  const hasData = renderRows.length > 0;

  function downloadCsvReport(){
    if(tab === "daily") downloadCsv(`KNCC_daily_${date}.csv`, dailyRows.map(r=>({student:r.student?.full_name??"",index_number:r.student?.index_number??"",class:`${r.student?.grade?.name??""} ${r.student?.division?.name??""}`,type:r.attendance_type,status:r.status,time:r.scan_time})));
    else if(tab === "scans") downloadCsv(`KNCC_scan_activity_${date}.csv`, filteredScans.map(r=>({time:r.scanned_at,uid:r.rfid_uid,student:r.student?.full_name??"Unknown",index_number:r.student?.index_number??"",verification:r.verification_status,signal_fingerprint:r.signal_fingerprint??"",attendance_type:r.attendance_type??"",attendance_status:r.attendance_status??"",device:r.device?.device_name??""})));
    else toast("CSV export is most detailed on Daily Attendance and Scan Activity tabs.");
  }

  const selectedStudent = students.find(s=>s.id===selectedStudentId);
  return <div>
    <div className="print:hidden"><PageHeader title="Reports" description="Professional, print-ready attendance and RFID scan reports." action={<div className="flex flex-wrap gap-2"><button className="btn-outline" onClick={downloadCsvReport} disabled={!hasData}><Download className="h-4 w-4" /> Export CSV</button><button className="btn-primary" onClick={()=>window.print()} disabled={!hasData}><Printer className="h-4 w-4" /> Download / Save PDF</button></div>} /></div>
    <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 print:hidden">{TABS.map(t=><button key={t.key} onClick={()=>setTab(t.key)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium",tab===t.key?"bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-400":"text-slate-600 dark:text-slate-300")}>{t.label}</button>)}</div>
    <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden"><span className="text-xs font-medium text-slate-400">Filter</span>{(tab==="daily"||tab==="grade"||tab==="class"||tab==="scans")&&<input type="date" className="input w-48" value={date} onChange={e=>setDate(e.target.value)} />}{tab==="monthly"&&<input type="month" className="input w-48" value={month} onChange={e=>setMonth(e.target.value)} />}{tab==="student"&&<select className="input sm:w-80" value={selectedStudentId} onChange={e=>setSelectedStudentId(e.target.value)}><option value="">Select a student…</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name} — {s.index_number}</option>)}</select>}{tab==="scans"&&<div className="relative min-w-[260px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input className="input pl-9" placeholder="Search UID, student, result…" value={search} onChange={e=>setSearch(e.target.value)}/></div>}</div>

    <div className="report-paper">
      <div className="mb-5 hidden border-b border-slate-300 pb-4 print:block"><div className="flex items-center gap-4"><img src="/school-logo.png" alt="School logo" className="h-16 w-16 object-contain"/><div><h1 className="text-xl font-bold text-slate-900">KN/Kilinochchi Central College</h1><p className="text-sm text-slate-500">RFID Attendance Management System</p><p className="mt-1 text-xs text-slate-400">Report: {TABS.find(t=>t.key===tab)?.label} · Generated {formatDateTime(new Date().toISOString())}</p></div></div></div>
      {loading ? <div className="flex justify-center py-16 print:hidden"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div> : tab === "student" && !selectedStudentId ? <EmptyState icon={Search} title="Select a student" description="Choose a student above to view their attendance summary." /> : !hasData ? <EmptyState icon={FileBarChart} title="No report data" description="There is no data for the selected period." /> : <div className="card overflow-x-auto print:shadow-none print:border-slate-300">
        <div className="hidden grid-cols-4 gap-3 border-b border-slate-200 p-4 print:grid"><div><p className="text-[10px] uppercase tracking-wide text-slate-400">Rows</p><p className="text-lg font-semibold">{renderRows.length}</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-400">Date / Month</p><p className="text-sm font-medium">{tab==="monthly"?month:date}</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-400">Student</p><p className="text-sm font-medium">{selectedStudent?.full_name ?? "All students"}</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-400">Report type</p><p className="text-sm font-medium">{TABS.find(t=>t.key===tab)?.label}</p></div></div>
        {tab === "daily" && <table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-4 py-3 text-center">#</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Time</th></tr></thead><tbody>{dailyRows.map((r,i)=><tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-center text-xs text-slate-400">{i+1}</td><td className="px-4 py-3">{r.student?.full_name} <span className="text-xs text-slate-400">({r.student?.index_number})</span></td><td className="px-4 py-3">{r.student?.grade?.name} {r.student?.division?.name}</td><td className="px-4 py-3">{r.attendance_type}</td><td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td><td className="px-4 py-3">{formatTime(r.scan_time)}</td></tr>)}</tbody></table>}
        {tab === "monthly" && <table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Days Present</th><th className="px-4 py-3">On Time</th><th className="px-4 py-3">Late</th></tr></thead><tbody>{monthlyRows.map((r,i)=><tr key={i} className="border-b border-slate-100"><td className="px-4 py-3">{r.student?.full_name} <span className="text-xs text-slate-400">({r.student?.index_number})</span></td><td className="px-4 py-3">{r.daysPresent}</td><td className="px-4 py-3">{r.present}</td><td className="px-4 py-3">{r.late}</td></tr>)}</tbody></table>}
        {tab === "grade" && <table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Late</th></tr></thead><tbody>{gradeRows.map((r,i)=><tr key={i} className="border-b border-slate-100"><td className="px-4 py-3">{r.name}</td><td className="px-4 py-3">{r.present}</td><td className="px-4 py-3">{r.late}</td></tr>)}</tbody></table>}
        {tab === "class" && <table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Class</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Late</th></tr></thead><tbody>{classRows.map((r,i)=><tr key={i} className="border-b border-slate-100"><td className="px-4 py-3">{r.name}</td><td className="px-4 py-3">{r.present}</td><td className="px-4 py-3">{r.late}</td></tr>)}</tbody></table>}
        {tab === "student" && <table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Time</th></tr></thead><tbody>{studentRows.map(r=><tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3">{formatDate(r.attendance_date)}</td><td className="px-4 py-3">{r.attendance_type}</td><td className="px-4 py-3">{r.status}</td><td className="px-4 py-3">{formatTime(r.scan_time)}</td></tr>)}</tbody></table>}
        {tab === "scans" && <div className="mb-4 hidden grid-cols-4 gap-3 border-b border-slate-200 p-4 print:grid">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Total scans</p><p className="text-lg font-semibold">{filteredScans.length}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Verified / enrolled</p><p className="text-lg font-semibold">{filteredScans.filter((r) => ["verified", "signal_enrolled"].includes(r.verification_status)).length}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Invalid / mismatch</p><p className="text-lg font-semibold">{filteredScans.filter((r) => ["card_invalid", "signal_mismatch"].includes(r.verification_status)).length}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">With attendance</p><p className="text-lg font-semibold">{filteredScans.filter((r) => !!r.attendance_record_id).length}</p></div>
        </div>}

        {tab === "scans" && <table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-4 py-3 text-center">#</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">UID</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Signal</th><th className="px-4 py-3">Attendance</th></tr></thead><tbody>{filteredScans.map((r,i)=><tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-center text-xs text-slate-400">{i+1}</td><td className="px-4 py-3">{formatTime(r.scanned_at)}</td><td className="px-4 py-3 font-mono text-xs">{r.rfid_uid}</td><td className="px-4 py-3">{r.student?.full_name ?? "Unknown"}</td><td className="px-4 py-3">{r.verification_status}</td><td className="px-4 py-3">{r.signal_fingerprint ? "Verified profile" : "—"}</td><td className="px-4 py-3">{r.attendance_type ? `${r.attendance_type} / ${r.attendance_status ?? ""}` : "—"}</td></tr>)}</tbody></table>}
      </div>}
    </div>
  </div>;
}
