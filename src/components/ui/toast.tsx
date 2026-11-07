"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; title: string; description?: string; kind: "success" | "error" | "info" };
type Ctx = { toast: (t: Omit<Toast, "id">) => void; success: (title: string, description?: string) => void; error: (title: string, description?: string) => void; info: (title: string, description?: string) => void };

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.kind === "error" ? 7000 : 4000);
  }, []);
  const ctx: Ctx = {
    toast,
    success: (title, description) => toast({ title, description, kind: "success" }),
    error: (title, description) => toast({ title, description, kind: "error" }),
    info: (title, description) => toast({ title, description, kind: "info" }),
  };
  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto fade-up flex items-start gap-3 rounded-xl border bg-surface p-3.5 shadow-pop", t.kind === "error" ? "border-danger/30" : t.kind === "success" ? "border-success/30" : "border-line")}>
            {t.kind === "success" && <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />}
            {t.kind === "error" && <AlertCircle className="mt-0.5 h-5 w-5 text-danger" />}
            {t.kind === "info" && <Info className="mt-0.5 h-5 w-5 text-primary" />}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-muted">{t.description}</p>}
            </div>
            <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
}
