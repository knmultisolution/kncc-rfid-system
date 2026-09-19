import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-primary mt-5">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
