"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "./modal";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger = true,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
