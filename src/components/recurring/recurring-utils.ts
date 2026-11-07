import type { RecurringPayment } from "@/lib/db/schema";

export const FREQ_LABEL: Record<RecurringPayment["frequency"], string> = {
  WEEKLY: "Weekly", BIWEEKLY: "Every 2 weeks", MONTHLY: "Monthly", QUARTERLY: "Quarterly", HALF_YEARLY: "Every 6 months", YEARLY: "Yearly",
};

export function monthlyEquivalent(amountMinor: number, f: RecurringPayment["frequency"]): number {
  const factor = f === "WEEKLY" ? 52 / 12 : f === "BIWEEKLY" ? 26 / 12 : f === "MONTHLY" ? 1 : f === "QUARTERLY" ? 1 / 3 : f === "HALF_YEARLY" ? 1 / 6 : 1 / 12;
  return Math.round(amountMinor * factor);
}

export function daysUntil(iso: string, today: string): number {
  return Math.round((new Date(iso + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
}

export function relativeLabel(iso: string, today: string): string {
  const d = daysUntil(iso, today);
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d === -1) return "1 day overdue";
  if (d < 0) return `${-d} days overdue`;
  if (d < 30) return `in ${d} days`;
  const months = Math.round(d / 30);
  return `in ${months} month${months === 1 ? "" : "s"}`;
}
