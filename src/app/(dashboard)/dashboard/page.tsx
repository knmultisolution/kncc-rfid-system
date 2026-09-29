import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatTime, timeAgo, computeEffectiveDeviceStatus } from "@/lib/utils";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  LogIn,
  LogOut,
  Percent,
  Radio,
  Cpu,
  CloudOff,
  ScanLine,
} from "lucide-react";

export default async function DashboardPage() {
  const profile = await requireApprovedProfile();
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { count: totalStudents },
    { data: todayRecords },
    { count: deviceCount },
    { data: devices },
    { count: pendingSync },
    { data: latestScan },
  ] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("attendance_records").select("status, attendance_type, student_id").eq("attendance_date", today),
    supabase.from("attendance_devices").select("*", { count: "exact", head: true }),
    supabase.from("attendance_devices").select("*"),
    supabase.from("attendance_sync_queue").select("*", { count: "exact", head: true }).eq("sync_status", "pending"),
    supabase
      .from("attendance_records")
      .select("*, student:students(full_name, index_number), device:attendance_devices(device_name)")
      .order("scan_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const present = todayRecords?.filter((r) => r.status === "present").length ?? 0;
  const late = todayRecords?.filter((r) => r.status === "late").length ?? 0;
  const entries = todayRecords?.filter((r) => r.attendance_type === "entry").length ?? 0;
  const exits = todayRecords?.filter((r) => r.attendance_type === "exit").length ?? 0;
  const presentStudentIds = new Set(todayRecords?.map((r) => r.student_id) ?? []);
  const absent = Math.max((totalStudents ?? 0) - presentStudentIds.size, 0);
  const attendancePct = totalStudents ? Math.round((presentStudentIds.size / totalStudents) * 100) : 0;

  const onlineDevices = devices?.filter((d) => computeEffectiveDeviceStatus(d.status, d.last_heartbeat_at) === "online").length ?? 0;
  const offlineDevices = (deviceCount ?? 0) - onlineDevices;

  const hasAnyData = (totalStudents ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile.full_name.split(" ")[0]}`}
        description="Live overview of today's attendance across KN/Kilinochchi Central College."
      />

      {!hasAnyData && (
        <div className="mb-6">
          <EmptyState
            icon={Users}
            title="No students added yet"
            description="Add your first student and RFID card to start seeing live attendance data on this dashboard."
            actionHref="/students"
            actionLabel="Add a student"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total Students" value={totalStudents ?? 0} icon={Users} tone="info" />
        <StatCard label="Present Today" value={present} icon={UserCheck} tone="success" />
        <StatCard label="Absent Today" value={hasAnyData ? absent : 0} icon={UserX} tone="danger" />
        <StatCard label="Late Today" value={late} icon={Clock} tone="warning" />
        <StatCard label="Entries" value={entries} icon={LogIn} tone="default" />
        <StatCard label="Exits" value={exits} icon={LogOut} tone="default" />
        <StatCard label="Attendance %" value={`${attendancePct}%`} icon={Percent} tone="info" />
        <StatCard label="Pending Offline Records" value={pendingSync ?? 0} icon={CloudOff} tone={pendingSync ? "warning" : "default"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Latest Scan</h3>
          </div>
          {latestScan ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {(latestScan as any).student?.full_name ?? "Unknown student"}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Index No. {(latestScan as any).student?.index_number ?? "—"}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge tone={statusTone(latestScan.status)}>{latestScan.status}</Badge>
                <Badge tone="slate">{latestScan.attendance_type}</Badge>
                <span className="text-xs text-slate-400">{formatTime(latestScan.scan_time)} · {timeAgo(latestScan.scan_time)}</span>
              </div>
              <p className="pt-1 text-xs text-slate-400">
                Device: {(latestScan as any).device?.device_name ?? "Unknown"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No scans recorded yet today.</p>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Device Status</h3>
          </div>
          {deviceCount ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Radio className="h-3.5 w-3.5 text-emerald-500" /> Online
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{onlineDevices}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Radio className="h-3.5 w-3.5 text-red-500" /> Offline
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{offlineDevices}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">Total registered</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{deviceCount}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No RFID devices registered yet. Add RFID-01, RFID-02, or RFID-03 from the RFID Devices page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
