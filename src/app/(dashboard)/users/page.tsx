"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, statusTone } from "@/components/ui/badge";
import { UserCog, Search, Loader2, Ban, CheckCircle2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Profile, UserRole } from "@/types";
import { ROLE_LABELS } from "@/types";
import { formatDate } from "@/lib/utils";

export default function UsersPage() {
  const supabase = createClient();
  const [me, setMe] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const [roleTarget, setRoleTarget] = useState<Profile | null>(null);
  const [newRole, setNewRole] = useState<UserRole>("teacher");
  const [saving, setSaving] = useState(false);

  const [disableTarget, setDisableTarget] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: user }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    ]);
    if (error) toast.error(error.message);
    setMe((data as Profile[] | null)?.find((p) => p.id === user.user?.id) ?? null);
    setUsers((data as Profile[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const superAdminCount = users.filter((u) => u.role === "super_admin" && u.status === "approved").length;

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchesRole = !roleFilter || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  function openRoleChange(u: Profile) {
    setRoleTarget(u);
    setNewRole(u.role ?? "teacher");
  }

  async function handleRoleChange(e: React.FormEvent) {
    e.preventDefault();
    if (!roleTarget) return;
    if (newRole === "super_admin" && roleTarget.role !== "super_admin" && superAdminCount >= 3) {
      toast.error("Maximum of 3 Super Admin accounts already exist.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole, status: "approved" })
      .eq("id", roleTarget.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Role updated");
    setRoleTarget(null);
    load();
  }

  async function handleDisable() {
    if (!disableTarget) return;
    setBusy(true);
    const nextStatus = disableTarget.status === "disabled" ? "approved" : "disabled";
    const { error } = await supabase.from("profiles").update({ status: nextStatus }).eq("id", disableTarget.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(nextStatus === "disabled" ? "User disabled" : "User re-enabled");
    setDisableTarget(null);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").delete().eq("id", deleteTarget.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("User removed");
    setDeleteTarget(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description={`Manage staff accounts and roles. Super Admins: ${superAdminCount} / 3.`}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-48" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={UserCog} title="No users found" description="Approved and pending accounts will appear here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{u.full_name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">{u.role ? <Badge tone={statusTone(u.role)}>{ROLE_LABELS[u.role]}</Badge> : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openRoleChange(u)}
                        disabled={u.id === me?.id}
                        title="Change role"
                        className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:hover:bg-brand-950"
                      >
                        Change role
                      </button>
                      <button
                        onClick={() => setDisableTarget(u)}
                        disabled={u.id === me?.id}
                        title={u.status === "disabled" ? "Re-enable" : "Disable"}
                        className="rounded p-1.5 text-amber-600 hover:bg-amber-50 disabled:opacity-40 dark:hover:bg-amber-950"
                      >
                        {u.status === "disabled" ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={u.id === me?.id}
                        title="Delete"
                        className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!roleTarget} onClose={() => setRoleTarget(null)} title="Change Role">
        <form onSubmit={handleRoleChange} className="space-y-4">
          <div>
            <p className="label">User</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{roleTarget?.full_name}</p>
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k} disabled={k === "super_admin" && roleTarget?.role !== "super_admin" && superAdminCount >= 3}>
                  {v}{k === "super_admin" ? ` (${superAdminCount}/3 used)` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setRoleTarget(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!disableTarget}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleDisable}
        title={disableTarget?.status === "disabled" ? "Re-enable user" : "Disable user"}
        description={
          disableTarget?.status === "disabled"
            ? "This user will regain access to the system with their existing role."
            : "This user will immediately lose access to the system until re-enabled."
        }
        confirmLabel={disableTarget?.status === "disabled" ? "Re-enable" : "Disable"}
        danger={disableTarget?.status !== "disabled"}
        loading={busy}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete user"
        description={`Permanently remove "${deleteTarget?.full_name}"? This does not delete their Supabase Auth login — disable the account instead if you may need to restore access.`}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  );
}
