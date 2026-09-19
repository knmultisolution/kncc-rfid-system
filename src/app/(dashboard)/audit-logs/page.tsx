"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { History, Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";
import { formatDateTime } from "@/lib/utils";

export default function AuditLogsPage() {
  const supabase = createClient();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*, actor:profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) toast.error(error.message);
    setLogs(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.action?.toLowerCase().includes(q) ||
        l.entity_type?.toLowerCase().includes(q) ||
        l.actor?.full_name?.toLowerCase().includes(q)
    );
  }, [logs, search]);

  return (
    <div>
      <PageHeader title="Audit Logs" description="A record of sensitive actions taken across the system, for accountability and review." />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search by action, entity, or actor..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : logs.length === 0 ? (
        <EmptyState icon={History} title="No audit activity recorded yet" description="Actions like approvals, role changes, and attendance edits will be logged here as they happen." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matching entries" description="Try a different search term." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDateTime(l.created_at)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{l.actor?.full_name ?? "System"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">{l.action}</td>
                  <td className="px-4 py-3 text-slate-500">{l.entity_type}{l.entity_id ? ` #${String(l.entity_id).slice(0, 8)}` : ""}</td>
                  <td className="px-4 py-3 max-w-sm truncate text-xs text-slate-400">{l.details ? JSON.stringify(l.details) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
