import { asc, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { buildTxnWhere } from "@/lib/queries";
import { parseFilters, type Preset, type SP } from "@/components/transactions/params";
import { fromMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp: SP = Object.fromEntries(url.searchParams.entries());
  const presetRaw = url.searchParams.get("preset");
  const preset: Preset = presetRaw === "INCOME" || presetRaw === "EXPENSE" ? presetRaw : "ALL";
  const filters = parseFilters(sp, preset);
  const [db, settings] = await Promise.all([getDb(), getSettings()]);
  const t = schema.transactions;
  const rows = await db.query.transactions.findMany({
    where: buildTxnWhere(filters),
    with: { account: true, category: true },
    orderBy: filters.sort === "date_asc" ? [asc(t.date), asc(t.createdAt)] : [desc(t.date), desc(t.createdAt)],
  });

  const header = ["Date", "Description", "Merchant", "Account", "Type", "Category", "Amount", "Currency", "Base Amount", "Base Currency", "Reference", "Notes", "Status"];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("﻿" + header.join(",") + "\r\n"));
      for (const r of rows) {
        const line = [
          r.date,
          r.description,
          r.merchant ?? "",
          r.account.name,
          r.type,
          r.category?.name ?? "",
          fromMinor(r.amountMinor).toFixed(2),
          r.currency,
          fromMinor(r.baseAmountMinor).toFixed(2),
          settings.baseCurrency,
          r.reference ?? "",
          r.notes ?? "",
          r.status,
        ].map(csvCell).join(",");
        controller.enqueue(encoder.encode(line + "\r\n"));
      }
      controller.close();
    },
  });
  const name = `${preset === "ALL" ? "transactions" : preset.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
