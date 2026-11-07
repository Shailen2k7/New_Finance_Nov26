"use client";
import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/misc";
import type { RangePreset } from "@/lib/reports";

export function RangePicker({ value }: { value: RangePreset }) {
  const router = useRouter();
  return (
    <Segmented
      value={value}
      onChange={(v) => router.push(`/?range=${v}`)}
      options={[
        { value: "this_month", label: "This month" },
        { value: "this_quarter", label: "Quarter" },
        { value: "this_year", label: "This year" },
        { value: "last_12", label: "12 months" },
      ]}
    />
  );
}
