import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return "Never";
  const d = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// A device sends a heartbeat every 30s (HEARTBEAT_INTERVAL_MS in its
// firmware config.h). If power is cut, it can never send a final
// "offline" message — so we can't wait for the device to tell us it's
// gone. Instead we treat "no heartbeat for 3 missed cycles" as offline,
// computed live on the client from last_heartbeat_at, rather than
// trusting the stored `status` column alone (which only ever gets set
// to "online" by a heartbeat, or "offline" by a *graceful* shutdown —
// neither of which happens on a sudden power loss).
export const DEVICE_OFFLINE_THRESHOLD_MS = 90_000; // 3x the 30s heartbeat interval

export type EffectiveDeviceStatus = "online" | "offline" | "unknown";

export function computeEffectiveDeviceStatus(
  storedStatus: string | null | undefined,
  lastHeartbeatAt: string | Date | null | undefined
): EffectiveDeviceStatus {
  // Never connected at all — nothing to time out.
  if (!lastHeartbeatAt) {
    return storedStatus === "offline" ? "offline" : "unknown";
  }

  const last = typeof lastHeartbeatAt === "string" ? new Date(lastHeartbeatAt) : lastHeartbeatAt;
  if (Number.isNaN(last.getTime())) return "unknown";

  const elapsedMs = Date.now() - last.getTime();
  if (elapsedMs > DEVICE_OFFLINE_THRESHOLD_MS) {
    return "offline";
  }

  // Heartbeat is recent enough to trust — but still honor an explicit
  // graceful "offline" the device reported itself (e.g. a controlled
  // reboot), since that's more precise than waiting out the timeout.
  return storedStatus === "offline" ? "offline" : "online";
}
