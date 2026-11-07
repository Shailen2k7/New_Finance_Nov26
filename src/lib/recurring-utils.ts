import { addWeeks, addMonths, addYears } from "date-fns";
import { toISO } from "./dates";

export type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";

export function advanceDate(iso: string, frequency: Frequency): string {
  const d = new Date(iso + "T00:00:00");
  const next =
    frequency === "WEEKLY" ? addWeeks(d, 1)
    : frequency === "BIWEEKLY" ? addWeeks(d, 2)
    : frequency === "MONTHLY" ? addMonths(d, 1)
    : frequency === "QUARTERLY" ? addMonths(d, 3)
    : frequency === "HALF_YEARLY" ? addMonths(d, 6)
    : addYears(d, 1);
  return toISO(next);
}
