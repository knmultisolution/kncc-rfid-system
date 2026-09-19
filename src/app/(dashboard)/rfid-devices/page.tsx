"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, statusTone } from "@/components/ui/badge";
import { Cpu, Plus, Loader2, Trash2, Radio, Wifi, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import type { AttendanceDevice } from "@/types";
import { formatDateTime, timeAgo, computeEffectiveDeviceStatus } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function RfidDevicesPage() {
  const supabase = createClient();
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [loading, setLoading] = useState(true);
  // Ticks every 5s purely to force a re-render, so a device that's gone
  // silent (power cut, no graceful "offline" message possible) flips to
  // "Offline" on screen the moment its heartbeat ages past the
  // threshold — without needing any new data from the server.
  const [, setClockTick] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ device_code: "", device_name: "", location: "" });
  const [deleteTarget, setDeleteTarget] = useState<AttendanceDevice | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("attendance_devices").select("*").order("device_code");
    if (error) toast.error(error.message);
    setDevices((data as AttendanceDevice[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("devices-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_devices" }, () => load())
      .subscribe();
    const tickInterval = setInterval(() => setClockTick((t) => t + 1), 5000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(tickInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setForm({ device_code: "", device_name: "", location: "" });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("attendance_devices").insert({
      device_code: form.device_code.trim(),
      device_name: form.device_name.trim(),
      location: form.location.trim() || null,
      status: "unknown",
    });
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("unique") ? "A device with this ID already exists." : error.message);
      return;
    }
    toast.success("Device registered. It will show Online after its first heartbeat.");
    setModalOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("attendance_devices").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Device removed");
    setDeleteTarget(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="RFID Devices"
        description="Manage ESP32 readers such as RFID-01 (Main Gate), RFID-02 (Primary Block), RFID-03 (Rear Entrance)."
        action={
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Device
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="No RFID devices configured yet"
          description='Add your gate readers (e.g. "RFID-01 — Main Gate") so they can authenticate and submit attendance scans.'
          actionHref="#"
          actionLabel=""
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const effectiveStatus = computeEffectiveDeviceStatus(d.status, d.last_heartbeat_at);
            return (
            <div key={d.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs text-slate-400">{d.device_code}</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{d.device_name}</p>
                  {d.location && <p className="text-xs text-slate-500 dark:text-slate-400">{d.location}</p>}
                </div>
                <Badge tone={statusTone(effectiveStatus)}>
                  {effectiveStatus === "online" ? <Wifi className="h-3 w-3" /> : effectiveStatus === "offline" ? <WifiOff className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                  {effectiveStatus}
                </Badge>
              </div>
              <div className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p>Firmware: {d.firmware_version ?? "—"}</p>
                <p>IP address: {d.ip_address ?? "—"}</p>
                <p>Last heartbeat: {d.last_heartbeat_at ? timeAgo(d.last_heartbeat_at) : "Never"}</p>
                <p>Last scan: {d.last_scan_at ? formatDateTime(d.last_scan_at) : "No scans yet"}</p>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setDeleteTarget(d)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add RFID Device">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Device ID</label>
            <input className="input" required value={form.device_code} onChange={(e) => setForm({ ...form, device_code: e.target.value })} placeholder="e.g. RFID-01" />
          </div>
          <div>
            <label className="label">Device name / location</label>
            <input className="input" required value={form.device_name} onChange={(e) => setForm({ ...form, device_name: e.target.value })} placeholder="e.g. Main Gate" />
          </div>
          <div>
            <label className="label">Location notes (optional)</label>
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Near the flagpole" />
          </div>
          <p className="text-xs text-slate-400">
            After adding, generate a per-device secret in your ESP32 firmware config using your <code>DEVICE_API_SECRET</code> and this Device ID — never store the secret in this dashboard.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove device"
        description={`Remove "${deleteTarget?.device_name}"? Historical attendance records from this device will be kept but no longer show a live status.`}
        confirmLabel="Remove"
        loading={deleting}
      />
    </div>
  );
}
