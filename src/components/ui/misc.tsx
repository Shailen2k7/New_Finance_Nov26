import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

export function StatTile({ label, value, sub, tone, className, text }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down" | "neutral"; className?: string; text?: boolean }) {
  return (
    <div className={cn("card min-w-0 p-4 sm:p-5", className)}>
      <p className="truncate text-[13px] text-muted">{label}</p>
      <p title={typeof value === "string" ? value : undefined} className={cn("stat-value mt-1.5 text-ink", text ? "!whitespace-normal !text-[15px] leading-snug sm:!text-[18px]" : "truncate")}>{value}</p>
      {sub && <p className={cn("mt-1 text-[12px]", tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-muted")}>{sub}</p>}
    </div>
  );
}

export function Money({ minor, currency, signed, className, colored }: { minor: number; currency: string; signed?: boolean; className?: string; colored?: boolean }) {
  return (
    <span className={cn("tnum", colored && (minor > 0 ? "text-success" : minor < 0 ? "text-ink" : "text-muted"), className)}>
      {formatMoney(minor, currency, { signed })}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary">{icon}</div>}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const AVATAR_TINTS = [
  ["#e6f4ec", "#2f7a5c"],
  ["#fdeedd", "#b8691f"],
  ["#e8f1fb", "#3f6f9e"],
  ["#f7f1e6", "#8a6d2f"],
  ["#f1edf7", "#6d5a96"],
  ["#e7f3f3", "#35807f"],
];

export function InitialAvatar({ seed, size = 36, className }: { seed: string; size?: number; className?: string }) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATAR_TINTS[h % AVATAR_TINTS.length];
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold", className)} style={{ width: size, height: size, background: bg, color: fg }}>{seed.trim().charAt(0).toUpperCase() || "?"}</span>;
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function ProgressBar({ value, color = "var(--color-primary)", className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-[#eceef2]", className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={cn("no-scrollbar inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn("whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition sm:px-3", value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-[24px]">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
