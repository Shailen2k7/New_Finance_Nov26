import { NextResponse, type NextRequest } from "next/server";
import { resolveRange, getMonthlyPnl, getReportTotals } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { fromMinor } from "@/lib/money";
import { monthLabel } from "@/lib/dates";

export const dynamic = "force-dynamic";

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const range = resolveRange({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, preset: sp.get("preset") ?? undefined });
  const account = sp.get("account");
  const accountId = account && /^[0-9a-f-]{36}$/i.test(account) ? account : undefined;
  const [settings, monthly, totals] = await Promise.all([getSettings(), getMonthlyPnl(range, accountId), getReportTotals(range, accountId)]);
  const cur = settings.baseCurrency;
  const lines: string[] = [
    ["Month", `Income (${cur})`, `Expenses (${cur})`, `Net (${cur})`, `Cumulative (${cur})`].map(csvCell).join(","),
    ...monthly.map((m) => [monthLabel(m.month), fromMinor(m.incomeMinor).toFixed(2), fromMinor(Math.abs(m.expenseMinor)).toFixed(2), fromMinor(m.netMinor).toFixed(2), fromMinor(m.cumulativeMinor).toFixed(2)].map(csvCell).join(",")),
    ["Total", fromMinor(totals.incomeMinor).toFixed(2), fromMinor(Math.abs(totals.expenseMinor)).toFixed(2), fromMinor(totals.netMinor).toFixed(2), fromMinor(totals.netMinor).toFixed(2)].map(csvCell).join(","),
  ];
  const body = "﻿" + lines.join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="migrizo-pnl-${range.from}-to-${range.to}.csv"`,
    },
  });
}
