"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, FileUp, Landmark, Repeat, CornerDownLeft } from "lucide-react";
import { ALL_PAGES } from "./nav";
import { cn } from "@/lib/utils";

type Item = { id: string; label: string; hint?: string; href: string; icon: React.ElementType; group: string; keywords?: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: "new-txn", label: "Add transaction", hint: "Income or expense", href: "/transactions?new=1", icon: Plus, group: "Actions", keywords: "create new income expense" },
      { id: "import", label: "Import bank statement", hint: "PDF, CSV, Excel or image", href: "/import", icon: FileUp, group: "Actions", keywords: "upload ai parse" },
      { id: "new-loan", label: "Add loan", href: "/loans?new=1", icon: Landmark, group: "Actions" },
      { id: "new-rec", label: "Add recurring payment", href: "/recurring?new=1", icon: Repeat, group: "Actions", keywords: "subscription" },
    ];
    const pages: Item[] = ALL_PAGES.map((n) => ({ id: n.href, label: n.label, href: n.href, icon: n.icon, group: "Pages", keywords: n.keywords }));
    return [...actions, ...pages];
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => (i.label + " " + (i.hint ?? "") + " " + (i.keywords ?? "")).toLowerCase().includes(s));
  }, [q, items]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => setIdx(0), [q]);

  if (!open) return null;
  const go = (item: Item) => {
    onClose();
    router.push(item.href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter" && filtered[idx]) go(filtered[idx]);
    if (e.key === "Escape") onClose();
  };
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fade-up relative w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-muted" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Type a command or search…" className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
          <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted">No results</p>}
          {filtered.map((item, i) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {showGroup && <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint">{item.group}</p>}
                <button onMouseEnter={() => setIdx(i)} onClick={() => go(item)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px]", i === idx ? "bg-primary-50 text-ink" : "text-ink-2")}>
                  <item.icon className="h-4 w-4 text-muted" />
                  <span className="flex-1">{item.label}{item.hint && <span className="ml-2 text-[12px] text-muted">{item.hint}</span>}</span>
                  {i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
