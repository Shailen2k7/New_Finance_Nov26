import { LayoutDashboard, ArrowLeftRight, TrendingUp, TrendingDown, FileUp, Repeat, Landmark, BarChart3, Wallet, Tags, Settings, History, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; keywords?: string; match?: string[] };

/** The sidebar. Sub-pages live in PAGE_TABS and keep their parent highlighted through `match`. */
export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, keywords: "home overview" },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, keywords: "ledger", match: ["/import"] },
  { href: "/income", label: "Income & Expenses", icon: TrendingUp, keywords: "revenue sales spend costs", match: ["/expenses"] },
  { href: "/recurring", label: "Recurring", icon: Repeat, keywords: "subscriptions bills" },
  { href: "/loans", label: "Loans", icon: Landmark, keywords: "debt borrow lend" },
  { href: "/reports", label: "Reports", icon: BarChart3, keywords: "profit loss cashflow" },
];

/** Pinned to the bottom of the sidebar. */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings, keywords: "currency api key business password logout sign out", match: ["/accounts", "/categories", "/activity"] };

export const SIDEBAR_NAV: NavItem[] = [...MAIN_NAV, SETTINGS_ITEM];

export const PAGE_TABS = {
  transactions: [
    { href: "/transactions", label: "All transactions", icon: ArrowLeftRight, keywords: "ledger" },
    { href: "/import", label: "Import statements", icon: FileUp, keywords: "upload bank statement pdf csv ai" },
  ],
  money: [
    { href: "/income", label: "Income", icon: TrendingUp, keywords: "revenue sales" },
    { href: "/expenses", label: "Expenses", icon: TrendingDown, keywords: "spend costs" },
  ],
  settings: [
    { href: "/settings", label: "General", icon: Settings, keywords: "currency api key business password" },
    { href: "/accounts", label: "Accounts", icon: Wallet, keywords: "bank cards" },
    { href: "/categories", label: "Categories", icon: Tags },
    { href: "/activity", label: "Activity", icon: History, keywords: "audit log history changes who" },
  ],
} satisfies Record<string, NavItem[]>;

export type TabGroup = keyof typeof PAGE_TABS;

/** Every destination for the command palette: the sidebar plus the tabs that are not sidebar entries themselves. */
export const ALL_PAGES: NavItem[] = [
  ...SIDEBAR_NAV,
  ...Object.values(PAGE_TABS).flat().filter((t) => !SIDEBAR_NAV.some((n) => n.href === t.href)),
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.match ?? [])].some((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(h + "/")));
}

export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/import/")) return "Review Import";
  return SIDEBAR_NAV.find((n) => isNavActive(n, pathname))?.label ?? "Migrizo";
}
