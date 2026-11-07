"use client";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", loading, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-[14px]",
        size === "lg" && "h-11 px-5 text-[15px]",
        size === "icon" && "h-9 w-9",
        variant === "primary" && "bg-primary text-white shadow-sm hover:bg-primary-600",
        variant === "secondary" && "bg-surface-2 text-ink hover:bg-[#eef0f4] border border-line",
        variant === "outline" && "bg-surface text-ink border border-line-strong hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2",
        variant === "danger" && "bg-danger text-white hover:bg-red-700",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});
