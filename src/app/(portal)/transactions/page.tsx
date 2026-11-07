import { TransactionsPage } from "@/components/transactions/transactions-page";
import type { SP } from "@/components/transactions/params";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: Promise<SP> }) {
  return <TransactionsPage searchParams={searchParams} preset="ALL" />;
}
