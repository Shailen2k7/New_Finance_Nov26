"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus, Search } from "lucide-react";
import { pageTitle } from "./nav";

export function Topbar({ onMenu, onCommand, userName }: { onMenu: () => void; onCommand: () => void; userName: string }) {
  const initials = userName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const pathname = usePathname();
  const title = pageTitle(pathname);
  const hasOwnAdd = ["/transactions", "/income", "/expenses"].includes(pathname);
  return (
    <header className="flex h-[68px] items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-5 lg:px-7">
      <div className="flex min-w-0 items-center gap-3 text-[15px]">
        <button onClick={onMenu} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <Link href="/" className="hidden text-muted hover:text-ink sm:inline">Home</Link>
        <span className="hidden text-faint sm:inline">›</span>
        <span className="truncate font-medium text-ink">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <button onClick={onCommand} className="hidden h-10 w-[280px] items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-[14px] text-faint hover:border-line-strong md:flex">
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-muted">⌘K</kbd>
        </button>
        <button onClick={onCommand} aria-label="Search" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted md:hidden"><Search className="h-4 w-4" /></button>
        {!hasOwnAdd && (
          <Link href="/transactions?new=1" aria-label="Add transaction" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[14px] font-medium text-ink hover:bg-surface-2">
            <Plus className="h-4 w-4" /> <span className="hidden lg:inline">Add Transaction</span>
          </Link>
        )}
        <Link href="/settings" className="flex h-10 items-center gap-2 rounded-xl border border-line px-1.5 transition hover:bg-surface-2 sm:pr-3" title={`Signed in as ${userName}`}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-[12px] font-semibold text-primary">{initials}</span>
          <span className="hidden max-w-[120px] truncate text-[13px] font-medium text-ink sm:inline">{userName}</span>
        </Link>
      </div>
    </header>
  );
}
