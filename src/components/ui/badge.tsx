import { cn } from "@/lib/utils";

const TONE_MAP: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  blue: "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-400",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONE_MAP; children: React.ReactNode }) {
  return <span className={cn("badge", TONE_MAP[tone])}>{children}</span>;
}

export function statusTone(status: string): keyof typeof TONE_MAP {
  switch (status) {
    case "active":
    case "approved":
    case "present":
    case "online":
    case "synced":
      return "green";
    case "pending":
    case "late":
    case "unregistered":
      return "amber";
    case "rejected":
    case "disabled":
    case "absent":
    case "offline":
    case "failed":
    case "lost":
      return "red";
    case "super_admin":
    case "principal":
      return "blue";
    default:
      return "slate";
  }
}
