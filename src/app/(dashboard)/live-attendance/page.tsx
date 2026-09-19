"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import { Radio, Loader2, LogIn, LogOut } from "lucide-react";
import toast from "react-hot-toast";
import type { AttendanceRecord } from "@/types";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function LiveAttendancePage() {
  const supabase = createClient();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function beep() {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      audioCtxRef.current ??= new Ctx();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // audio not available - non-critical
    }
  }

  async function loadToday() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("attendance_records")
      .select("*, student:students(full_name, index_number, grade:grades(name), division:divisions(name)), device:attendance_devices(device_name)")
      .eq("attendance_date", today)
      .order("scan_time", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setRecords((data as AttendanceRecord[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadToday();

    const channel = supabase
      .channel("live-attendance-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attendance_records" },
        async (payload) => {
          const { data } = await supabase
            .from("attendance_records")
            .select("*, student:students(full_name, index_number, grade:grades(name), division:divisions(name)), device:attendance_devices(device_name)")
            .eq("id", (payload.new as any).id)
            .maybeSingle();
          if (data) {
            setRecords((prev) => [data as AttendanceRecord, ...prev].slice(0, 100));
            setFlashId(data.id);
            beep();
            setTimeout(() => setFlashId(null), 2000);
          }
        }
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        title="Live Attendance"
        description="Real-time feed of RFID scans as they happen across all gates."
        action={
          <span className={cn("badge", connected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800")}>
            <Radio className="h-3.5 w-3.5" /> {connected ? "Live" : "Connecting..."}
          </span>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No scans yet today"
          description="As students tap their RFID cards at any gate, their entry and exit scans will appear here instantly."
        />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div
              key={r.id}
              className={cn(
                "card flex items-center gap-4 p-4 transition-colors",
                flashId === r.id && "ring-2 ring-brand-500"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  r.attendance_type === "entry"
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400"
                )}
              >
                {r.attendance_type === "entry" ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {r.student?.full_name ?? "Unknown student"}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {r.student?.index_number}
                  {(r.student as any)?.grade?.name ? ` · ${(r.student as any).grade.name}` : ""}
                  {(r.student as any)?.division?.name ? ` ${(r.student as any).division.name}` : ""}
                  {r.device?.device_name ? ` · ${r.device.device_name}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                <Badge tone="slate">{r.attendance_type}</Badge>
                <span className="w-16 text-right text-xs tabular-nums text-slate-400">{formatTime(r.scan_time)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
