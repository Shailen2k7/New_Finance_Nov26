import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/settings/settings-form";
import { DeploymentCard } from "@/components/settings/deployment-card";
import { AccountCard } from "@/components/settings/account-card";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { PageTabs } from "@/components/layout/page-tabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, session] = await Promise.all([getSettings(), getSession()]);
  const envKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const deployment = {
    database: Boolean(process.env.DATABASE_URL),
    storage: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    auth: Boolean(process.env.APP_PASSWORD),
    worker: process.env.NETLIFY === "true",
  };
  return (
    <div>
      <PageTabs group="settings" />
      <PageHeader title="Settings" description="Business profile, base currency and AI configuration." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SettingsForm
          initial={{ businessName: settings.businessName, baseCurrency: settings.baseCurrency, fiscalYearStart: settings.fiscalYearStart, aiModel: settings.aiModel }}
          keyStatus={envKey ? "env" : settings.anthropicApiKey ? "stored" : "none"}
          passwordFromEnv={Boolean(process.env.APP_PASSWORD)}
        />
        <div className="space-y-5">
          <AccountCard userName={session?.name ?? "Unknown"} />
          <DeploymentCard {...deployment} />
        </div>
      </div>
    </div>
  );
}
