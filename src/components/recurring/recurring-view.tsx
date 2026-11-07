"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Repeat, Sparkles, Pencil, Trash2, Pause, Play, SkipForward, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ColorDot, EmptyState, PageHeader, StatTile } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { deleteRecurring, skipRecurring, toggleRecurring } from "@/lib/actions/recurring";
import type { Account, Category, RecurringPayment } from "@/lib/db/schema";
import { RecurringForm } from "./recurring-form";
import { MarkPaidForm } from "./mark-paid-form";
import { DetectModal } from "./detect-modal";
import { FREQ_LABEL, daysUntil, monthlyEquivalent, relativeLabel } from "./recurring-utils";
import { cn } from "@/lib/utils";

function Totals({ totals }: { totals: Record<string, number> }) {
  const e = Object.entries(totals);
  if (!e.length) return <>—</>;
  if (e.length === 1) return <>{formatMoney(Math.abs(e[0][1]), e[0][0])}</>;
  return <span className="flex flex-col gap-0.5 text-[18px]">{e.map(([c, v]) => <span key={c}>{formatMoney(Math.abs(v), c)}</span>)}</span>;
}

export function RecurringView({ items, accounts, categories, today, defaultCurrency }: { items: RecurringPayment[]; accounts: Account[]; categories: Category[]; today: string; defaultCurrency: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<{ open: boolean; item?: RecurringPayment | null }>({ open: false });
  const [pay, setPay] = useState<RecurringPayment | null>(null);
  const [del, setDel] = useState<RecurringPayment | null>(null);
  const [detect, setDetect] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1") setForm({ open: true, item: null });
  }, [params]);
  const closeForm = () => {
    setForm({ open: false });
    if (params.get("new")) router.replace("/recurring");
  };

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (err) {
        toast.error("Something went wrong", err instanceof Error ? err.message : undefined);
      }
    });

  const active = items.filter((i) => i.isActive);
  const outgoing: Record<string, number> = {}, incoming: Record<string, number> = {};
  for (const i of active) {
    const m = monthlyEquivalent(i.amountMinor, i.frequency);
    const t = i.amountMinor < 0 ? outgoing : incoming;
    t[i.currency] = (t[i.currency] ?? 0) + m;
  }
  const overdue = active.filter((i) => daysUntil(i.nextDueDate, today) < 0);
  const thisWeek = active.filter((i) => { const d = daysUntil(i.nextDueDate, today); return d >= 0 && d <= 7; });
  const upcoming = active.filter((i) => { const d = daysUntil(i.nextDueDate, today); return d > 7 && d <= 30; });
  const later = active.filter((i) => daysUntil(i.nextDueDate, today) > 30);
  const paused = items.filter((i) => !i.isActive);
  const byDate = (a: RecurringPayment, b: RecurringPayment) => (a.nextDueDate < b.nextDueDate ? -1 : 1);

  const Section = ({ title, list, tone }: { title: string; list: RecurringPayment[]; tone?: "red" | "amber" | "blue" | "gray" }) => {
    if (!list.length) return null;
    return (
      <div className="card mb-4 p-0">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <Badge tone={tone ?? "gray"}>{list.length}</Badge>
        </div>
        <div className="divide-y divide-line">
          {[...list].sort(byDate).map((i) => {
            const cat = categories.find((c) => c.id === i.categoryId);
            const acct = accounts.find((a) => a.id === i.accountId);
            const d = daysUntil(i.nextDueDate, today);
            return (
              <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-[#fafbfc]">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-[14px] font-medium text-ink">{i.name}{i.autoDetected && <Badge tone="purple" className="ml-2">Auto</Badge>}</p>
                  <p className="truncate text-[12px] text-muted">
                    {cat && <span className="mr-2 inline-flex items-center gap-1.5"><ColorDot color={cat.color} />{cat.name}</span>}
                    {acct ? acct.name : "No account"}{i.merchantPattern ? ` · ${i.merchantPattern}` : ""}
                  </p>
                </div>
                <Badge tone="gray">{FREQ_LABEL[i.frequency]}</Badge>
                <div className="w-40">
                  <p className="text-[13px]">{formatDate(i.nextDueDate)}</p>
                  <p className={cn("text-[12px]", !i.isActive ? "text-muted" : d < 0 ? "text-danger" : d <= 7 ? "text-warning" : "text-muted")}>{i.isActive ? relativeLabel(i.nextDueDate, today) : "Paused"}</p>
                </div>
                <span className={cn("tnum text-[14px] font-semibold sm:w-28 sm:text-right", i.amountMinor > 0 ? "text-success" : "text-ink")}>{formatMoney(i.amountMinor, i.currency, { signed: true })}</span>
                <div className="flex items-center gap-1">
                  {i.isActive && <Button size="sm" variant="secondary" onClick={() => setPay(i)} title="Mark paid"><Check className="h-3.5 w-3.5" /> Paid</Button>}
                  {i.isActive && <button className="rounded-lg p-2 text-faint hover:bg-surface-2 hover:text-ink" title="Skip this occurrence" onClick={() => run(() => skipRecurring(i.id), "Skipped to next occurrence")}><SkipForward className="h-4 w-4" /></button>}
                  <button className="rounded-lg p-2 text-faint hover:bg-surface-2 hover:text-ink" title={i.isActive ? "Pause" : "Resume"} onClick={() => run(() => toggleRecurring(i.id, !i.isActive), i.isActive ? "Paused" : "Resumed")}>{i.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                  <button className="rounded-lg p-2 text-faint hover:bg-surface-2 hover:text-ink" title="Edit" onClick={() => setForm({ open: true, item: i })}><Pencil className="h-4 w-4" /></button>
                  <button className="rounded-lg p-2 text-faint hover:bg-danger-50 hover:text-danger" title="Delete" onClick={() => setDel(i)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fade-up">
      <PageHeader title="Recurring Payments" description="Subscriptions, rent, retainers and any payment that repeats." actions={
        <>
          <Button variant="outline" onClick={() => setDetect(true)}><Sparkles className="h-4 w-4" /> Detect from transactions</Button>
          <Button onClick={() => setForm({ open: true, item: null })}><Plus className="h-4 w-4" /> Add recurring</Button>
        </>
      } />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Monthly outgoing" value={<Totals totals={outgoing} />} sub="Normalized per month" />
        <StatTile label="Monthly incoming" value={<Totals totals={incoming} />} sub="Retainers and recurring income" />
        <StatTile label="Overdue" value={overdue.length} tone={overdue.length ? "down" : "neutral"} sub={overdue.length ? "Needs attention" : "All caught up"} />
        <StatTile label="Due in next 7 days" value={thisWeek.length} sub={`${upcoming.length} more within 30 days`} />
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Repeat className="h-6 w-6" />} title="No recurring payments yet" description="Add subscriptions, rent and retainers, or let us detect them from your transactions." action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDetect(true)}><Sparkles className="h-4 w-4" /> Detect</Button>
              <Button onClick={() => setForm({ open: true, item: null })}><Plus className="h-4 w-4" /> Add recurring</Button>
            </div>
          } />
        </div>
      ) : (
        <>
          <Section title="Overdue" list={overdue} tone="red" />
          <Section title="Due this week" list={thisWeek} tone="amber" />
          <Section title="Upcoming (next 30 days)" list={upcoming} tone="blue" />
          <Section title="Later" list={later} />
          <Section title="Paused" list={paused} />
        </>
      )}

      {form.open && <RecurringForm open onClose={closeForm} item={form.item ?? null} accounts={accounts} categories={categories} defaultCurrency={defaultCurrency} />}
      {pay && <MarkPaidForm open onClose={() => setPay(null)} item={pay} accounts={accounts} />}
      {detect && <DetectModal open onClose={() => setDetect(false)} categories={categories} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={pending} title="Delete recurring payment?" message={`"${del?.name}" will be removed. Past transactions are kept.`} onConfirm={() => del && run(async () => { await deleteRecurring(del.id); setDel(null); }, "Deleted")} />
    </div>
  );
}
