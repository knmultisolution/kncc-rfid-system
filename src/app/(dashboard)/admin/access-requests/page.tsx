"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Loader2, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import type { AccessRequest, UserRole } from "@/types";
import { ROLE_LABELS } from "@/types";
import { formatDateTime } from "@/lib/utils";

export default function AccessRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [superAdminCount, setSuperAdminCount] = useState(0);

  const [approveTarget, setApproveTarget] = useState<AccessRequest | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>("teacher");
  const [saving, setSaving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<AccessRequest | null>(null);
  const [rejecting, setRejecting] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data, error }, { count }] = await Promise.all([
      supabase
        .from("access_requests")
        .select("*, profile:profiles!access_requests_profile_id_fkey(*)")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "super_admin").eq("status", "approved"),
    ]);
    if (error) toast.error(error.message);
    setRequests((data as AccessRequest[]) ?? []);
    setSuperAdminCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openApprove(r: AccessRequest) {
    setApproveTarget(r);
    setSelectedRole(r.requested_role ?? "teacher");
  }

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    if (!approveTarget) return;
    if (selectedRole === "super_admin" && superAdminCount >= 3) {
      toast.error("Maximum of 3 Super Admin accounts already exist.");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ role: selectedRole, status: "approved", approved_by: userData.user?.id ?? null, approved_at: new Date().toISOString() })
      .eq("id", approveTarget.profile_id);

    if (profileErr) {
      setSaving(false);
      toast.error(profileErr.message);
      return;
    }

    const { error: reqErr } = await supabase
      .from("access_requests")
      .update({ status: "approved", reviewed_by: userData.user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", approveTarget.id);

    setSaving(false);
    if (reqErr) {
      toast.error(reqErr.message);
      return;
    }
    toast.success(`${approveTarget.profile?.full_name ?? "User"} approved as ${ROLE_LABELS[selectedRole]}`);
    setApproveTarget(null);
    load();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setRejecting(true);
    const { data: userData } = await supabase.auth.getUser();

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", rejectTarget.profile_id);

    const { error: reqErr } = await supabase
      .from("access_requests")
      .update({ status: "rejected", reviewed_by: userData.user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", rejectTarget.id);

    setRejecting(false);
    if (profileErr || reqErr) {
      toast.error((profileErr ?? reqErr)?.message ?? "Failed to reject request");
      return;
    }
    toast.success("Request rejected");
    setRejectTarget(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Access Requests"
        description="Review pending registrations and assign a role to grant access."
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No pending access requests"
          description="When new users register, their requests will appear here for your approval."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{r.profile?.full_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{r.profile?.email}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Requested {formatDateTime(r.created_at)}
                  {r.requested_role ? <> · Requested role: <Badge tone="slate">{ROLE_LABELS[r.requested_role]}</Badge></> : null}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn-primary" onClick={() => openApprove(r)}>
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button className="btn-outline" onClick={() => setRejectTarget(r)}>
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!approveTarget} onClose={() => setApproveTarget(null)} title="Approve Access Request">
        <form onSubmit={handleApprove} className="space-y-4">
          <div>
            <p className="label">User</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{approveTarget?.profile?.full_name} — {approveTarget?.profile?.email}</p>
          </div>
          <div>
            <label className="label">Assign role</label>
            <select className="input" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as UserRole)}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k} disabled={k === "super_admin" && superAdminCount >= 3}>
                  {v}{k === "super_admin" ? ` (${superAdminCount}/3 used)` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">Every role must be explicitly selected before an account can access the dashboard.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setApproveTarget(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Approve
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="Reject access request"
        description={`Reject "${rejectTarget?.profile?.full_name}"'s request? They will not be able to access the dashboard.`}
        confirmLabel="Reject"
        loading={rejecting}
      />
    </div>
  );
}
