import { cn } from "@/lib/utils";

export function Card({ className, children, flush, ...rest }: React.HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <div className={cn("card", !flush && "p-5 sm:p-6", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[16px] font-semibold leading-6 text-ink">{title}</h3>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
    </div>
  );
}
