"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, statusTone } from "@/components/ui/badge";
import { CloudOff, Loader2, RefreshCcw, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import toast from "react-hot-toast";
import { formatDateTime } from "@/lib/utils";

export default function OfflineSyncPage() {
  const supabase = createClient();
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("attendance_sync_queue")
      .select("*, device:attendance_devices(device_name, device_code)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setQueue(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("sync-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_sync_queue" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = queue.filter((q) => q.sync_status === "pending").length;
  const failed = queue.filter((q) => q.sync_status === "failed").length;
  const synced = queue.filter((q) => q.sync_status === "synced").length;

  async function retry(id: string) {
    setRetrying(id);
    const { error } = await supabase.from("attendance_sync_queue").update({ sync_status: "pending", error_message: null }).eq("id", id);
    setRetrying(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Queued for retry. It will be reprocessed on the next sync cycle.");
    load();
  }

  return (
    <div>
      <PageHeader
        title="Offline Sync"
        description="Scans queued by ESP32 devices while offline, uploaded in batches once connectivity returns."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={pending} icon={Clock3} tone="warning" />
        <StatCard label="Failed" value={failed} icon={XCircle} tone="danger" />
        <StatCard label="Synced" value={synced} icon={CheckCircle2} tone="success" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : queue.length === 0 ? (
        <EmptyState
          icon={CloudOff}
          title="No offline scans recorded"
          description="When an ESP32 device is offline, it stores scans on its MicroSD card and uploads them here in a batch once it reconnects."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">RFID UID</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Scanned At</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {queue.map((q) => (
                <tr key={q.id}>
                  <td className="px-4 py-3 font-mono text-xs">{q.rfid_uid}</td>
                  <td className="px-4 py-3 text-slate-500">{q.device?.device_name ?? q.device?.device_code ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(q.scanned_at)}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(q.sync_status)}>{q.sync_status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{q.attempts}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs text-red-500">{q.error_message ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {q.sync_status === "failed" && (
                      <button onClick={() => retry(q.id)} disabled={retrying === q.id} className="rounded p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950">
                        {retrying === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
