"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Radio, Loader2, LogIn, LogOut, ShieldAlert, ScanLine } from "lucide-react";
import toast from "react-hot-toast";
import type { AttendanceScanEvent } from "@/types";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function LiveAttendancePage() {
  const supabase = createClient();
  const [events, setEvents] = useState<AttendanceScanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function beep(ok = true) {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      audioCtxRef.current ??= new Ctx();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }

  async function loadToday() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from("attendance_scan_events")
      .select("*, student:students(full_name, index_number, grade:grades(name), division:divisions(name)), device:attendance_devices(device_name)")
      .gte("scanned_at", `${today}T00:00:00+05:30`).lt("scanned_at", `${today}T23:59:59+05:30`)
      .order("scanned_at", { ascending: false }).limit(150);
    if (error) toast.error(error.message);
    setEvents((data as AttendanceScanEvent[]) ?? []); setLoading(false);
  }

  useEffect(() => {
    loadToday();
    const channel = supabase.channel("live-rfid-scan-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_scan_events" }, async (payload) => {
        const { data } = await supabase.from("attendance_scan_events")
          .select("*, student:students(full_name, index_number, grade:grades(name), division:divisions(name)), device:attendance_devices(device_name)")
          .eq("id", (payload.new as any).id).maybeSingle();
        if (data) {
          const event = data as AttendanceScanEvent;
          setEvents((prev) => [event, ...prev].slice(0, 150));
          setFlashId(event.id); beep(!["card_invalid", "signal_mismatch"].includes(event.verification_status));
          setTimeout(() => setFlashId(null), 1800);
        }
      }).subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tone(status: string) {
    if (status.includes("invalid") || status.includes("mismatch")) return "red" as const;
    if (status.includes("duplicate")) return "amber" as const;
    return "green" as const;
  }

  return <div>
    <PageHeader title="Live Attendance" description="Every RFID scan appears here in real time, including valid, duplicate, invalid, and signal-mismatch attempts." action={<span className={cn("badge", connected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800")}><Radio className="h-3.5 w-3.5" /> {connected ? "Live" : "Connecting..."}</span>} />
    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div> : events.length === 0 ? <EmptyState icon={Radio} title="No scans yet today" description="RFID activity will appear here as cards are scanned at the gates." /> : <div className="space-y-2">
      {events.map((r) => {
        const isInvalid = ["card_invalid", "signal_mismatch"].includes(r.verification_status);
        const isEntry = r.attendance_type === "entry";
        return <div key={r.id} className={cn("card flex items-center gap-4 p-4 transition-colors", flashId === r.id && "ring-2 ring-brand-500") }>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", isInvalid ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400" : isEntry ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" : "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400")}>{isInvalid ? <ShieldAlert className="h-5 w-5" /> : isEntry ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}</div>
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.student?.full_name ?? "Unknown / Unregistered"}</p><p className="truncate text-xs text-slate-500">{r.student?.index_number ?? "—"} · UID {r.rfid_uid}{r.device?.device_name ? ` · ${r.device.device_name}` : ""}</p></div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2"><Badge tone={tone(r.verification_status)}>{r.verification_status}</Badge>{r.attendance_type && <Badge tone="slate">{r.attendance_type}</Badge>}{r.signal_fingerprint && <span title="Signal profile stored/verified"><ScanLine className="h-4 w-4 text-emerald-500" /></span>}<span className="w-16 text-right text-xs tabular-nums text-slate-400">{formatTime(r.scanned_at)}</span></div>
        </div>;
      })}
    </div>}
  </div>;
}
