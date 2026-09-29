import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  sub,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  sub?: string;
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    danger: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
    info: "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400",
  };

  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", toneClasses[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
        {sub && <p className="truncate text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}
