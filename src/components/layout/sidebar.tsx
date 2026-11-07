"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { MAIN_NAV, SETTINGS_ITEM, isNavActive, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <Link href={item.href} className="nav-item" data-active={active} aria-current={active ? "page" : undefined} onClick={onClick}>
      <item.icon className="h-[18px] w-[18px] shrink-0 text-ink-2" strokeWidth={1.8} />
      {item.label}
    </Link>
  );
}

export function Sidebar({ businessName, open, onClose, aiReady }: { businessName: string; open: boolean; onClose: () => void; aiReady: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={onClose} />}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex h-dvh w-[256px] shrink-0 flex-col bg-page px-4 py-5 transition-transform lg:static lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-7 flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18V8l8 6 8-6v10" /></svg>
            </span>
            <span className="text-[15px] font-semibold text-ink">{businessName}</span>
          </Link>
          <button onClick={onClose} className="rounded-lg p-1 text-muted lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
          {MAIN_NAV.map((n) => <NavLink key={n.href} item={n} active={isNavActive(n, pathname)} onClick={onClose} />)}
        </nav>
        <div className="shrink-0 pt-4">
          {!aiReady && (
            <Link href="/settings" onClick={onClose} className="mb-3 flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 transition hover:border-line-strong">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning"><Sparkles className="h-3.5 w-3.5" /></span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">AI is off</span>
                <span className="mt-0.5 block text-[12px] leading-[17px] text-muted">Add an API key to read other banks&apos; PDFs.</span>
              </span>
            </Link>
          )}
          <NavLink item={SETTINGS_ITEM} active={isNavActive(SETTINGS_ITEM, pathname)} onClick={onClose} />
        </div>
      </aside>
    </>
  );
}
