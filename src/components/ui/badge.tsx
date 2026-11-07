import { cn } from "@/lib/utils";

export function Badge({ children, tone = "gray", className, dot }: { children: React.ReactNode; tone?: "gray" | "blue" | "green" | "red" | "amber" | "purple"; className?: string; dot?: boolean }) {
  const tones = {
    gray: "bg-[#f1f3f6] text-ink-2",
    blue: "bg-primary-50 text-primary",
    green: "bg-success-50 text-success",
    red: "bg-danger-50 text-danger",
    amber: "bg-warning-50 text-warning",
    purple: "bg-violet-50 text-violet-700",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
