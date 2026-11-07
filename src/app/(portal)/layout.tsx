import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { getSettings, getAnthropicKey } from "@/lib/settings";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [settings, key] = await Promise.all([getSettings(), getAnthropicKey()]);
  return (
    <Shell businessName={settings.businessName} userName={session.name} aiReady={Boolean(key)}>
      {children}
    </Shell>
  );
}
