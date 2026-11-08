"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open || !mounted) return null;
  // Portalled to <body>: pages animate in with a transform, which would otherwise trap `fixed` inside the page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn("fade-up relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop sm:max-h-[88dvh] sm:rounded-2xl", size === "sm" && "sm:max-w-md", size === "md" && "sm:max-w-lg", size === "lg" && "sm:max-w-2xl", size === "xl" && "sm:max-w-4xl")}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="-mr-1.5 shrink-0 rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 pt-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Delete", loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={
      <>
        <button onClick={onClose} className="h-10 rounded-xl border border-line bg-surface px-4 text-[14px] font-medium hover:bg-surface-2">Cancel</button>
        <button onClick={onConfirm} disabled={loading} className="h-10 rounded-xl bg-danger px-4 text-[14px] font-medium text-white hover:bg-red-700 disabled:opacity-60">{loading ? "Working…" : confirmLabel}</button>
      </>
    }>
      <p className="text-[14px] text-ink-2">{message}</p>
    </Modal>
  );
}
