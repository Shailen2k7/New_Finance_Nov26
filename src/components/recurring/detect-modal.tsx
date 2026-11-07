"use client";
import { useEffect, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { detectRecurring, addDetectedRecurring, type RecurringSuggestion } from "@/lib/actions/recurring-detect";
import type { Category } from "@/lib/db/schema";
import { FREQ_LABEL } from "./recurring-utils";

export function DetectModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: Category[] }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RecurringSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    detectRecurring()
      .then((res) => {
        setItems(res);
        setSelected(new Set(res.map((r) => r.key)));
      })
      .catch((err) => toast.error("Detection failed", err instanceof Error ? err.message : undefined))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const add = () =>
    start(async () => {
      try {
        const res = await addDetectedRecurring(items.filter((i) => selected.has(i.key)));
        toast.success(`Added ${res.added} recurring payment${res.added === 1 ? "" : "s"}`);
        onClose();
      } catch (err) {
        toast.error("Could not add", err instanceof Error ? err.message : undefined);
      }
    });

  return (
    <Modal open={open} onClose={onClose} title="Detected recurring payments" description="Patterns found in your transactions (3+ occurrences at a steady interval and amount)." size="lg" footer={
      <>
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={add} loading={pending} disabled={selected.size === 0 || loading}>Add selected ({selected.size})</Button>
      </>
    }>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Sparkles className="mb-2 h-6 w-6 text-faint" />
          <p className="text-[14px] font-medium">Nothing new detected</p>
          <p className="mt-1 text-[13px] text-muted">Import more statements and try again — repeated payments will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((s) => {
            const cat = categories.find((c) => c.id === s.categoryId);
            return (
              <label key={s.key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
                <input type="checkbox" checked={selected.has(s.key)} onChange={() => toggle(s.key)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{s.name}</p>
                  <p className="text-[12px] text-muted">{s.count} occurrences · next {formatDate(s.nextDueDate)}{cat ? ` · ${cat.name}` : ""}</p>
                </div>
                <Badge tone="gray">{FREQ_LABEL[s.frequency]}</Badge>
                <span className={`tnum text-[14px] font-medium ${s.amountMinor > 0 ? "text-success" : ""}`}>{formatMoney(s.amountMinor, s.currency, { signed: true })}</span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
