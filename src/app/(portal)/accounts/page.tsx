import { listAccounts } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { getAccountBalances } from "@/lib/actions/accounts";
import { PageTabs } from "@/components/layout/page-tabs";
import { AccountsView } from "@/components/accounts/accounts-view";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, balances, settings] = await Promise.all([listAccounts(true), getAccountBalances(), getSettings()]);
  const rows = accounts.map((a) => ({
    ...a,
    balanceMinor: a.openingBalanceMinor + (balances[a.id]?.sumMinor ?? 0),
    txnCount: balances[a.id]?.count ?? 0,
  }));
  return (
    <div>
      <PageTabs group="settings" />
      <AccountsView accounts={rows} baseCurrency={settings.baseCurrency} />
    </div>
  );
}
