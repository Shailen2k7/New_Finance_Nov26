"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PAGE_TABS, type TabGroup } from "./nav";
import { cn } from "@/lib/utils";

// Income and Expenses share the period and account, so flipping tabs compares like with like.
const SHARED_FILTERS = ["range", "from", "to", "accountId"];

export function PageTabs({ group }: { group: TabGroup }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const kept = new URLSearchParams();
  if (group === "money") for (const k of SHARED_FILTERS) { const v = sp.get(k); if (v) kept.set(k, v); }
  const query = kept.toString();
  return (
    <nav className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-line sm:mb-6" aria-label="Page sections">
      {PAGE_TABS[group].map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={query ? `${t.href}?${query}` : t.href} aria-current={active ? "page" : undefined} className={cn("-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[14px] transition", active ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-ink")}>
            <t.icon className="h-4 w-4" strokeWidth={1.8} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
