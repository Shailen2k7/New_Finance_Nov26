"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BarChart3, LayoutDashboard, Menu, Plus } from "lucide-react";
import { MAIN_NAV, isNavActive } from "./nav";
import { cn } from "@/lib/utils";

const tab = "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition active:scale-95";

/** Phone navigation: the most used places one thumb-tap away. "More" opens the full menu. */
export function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const home = pathname === "/";
  const txns = isNavActive(MAIN_NAV[1], pathname);
  const reports = pathname.startsWith("/reports");
  const more = !home && !txns && !reports;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[25] border-t border-line bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 px-1">
        <Link href="/" className={cn(tab, home ? "text-primary" : "text-muted")} aria-current={home ? "page" : undefined}>
          <LayoutDashboard className="h-[22px] w-[22px]" strokeWidth={home ? 2.2 : 1.8} />Home
        </Link>
        <Link href="/transactions" className={cn(tab, txns ? "text-primary" : "text-muted")} aria-current={txns ? "page" : undefined}>
          <ArrowLeftRight className="h-[22px] w-[22px]" strokeWidth={txns ? 2.2 : 1.8} />Transactions
        </Link>
        <Link href="/transactions?new=1" aria-label="Add transaction" className="flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-md transition active:scale-95"><Plus className="h-6 w-6" strokeWidth={2.4} /></span>
        </Link>
        <Link href="/reports" className={cn(tab, reports ? "text-primary" : "text-muted")} aria-current={reports ? "page" : undefined}>
          <BarChart3 className="h-[22px] w-[22px]" strokeWidth={reports ? 2.2 : 1.8} />Reports
        </Link>
        <button type="button" onClick={onMore} className={cn(tab, more ? "text-primary" : "text-muted")}>
          <Menu className="h-[22px] w-[22px]" strokeWidth={more ? 2.2 : 1.8} />More
        </button>
      </div>
    </nav>
  );
}
