import { Database, HardDrive, Lock, Cpu, Rocket } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DeploymentCard({ database, storage, auth, worker }: { database: boolean; storage: boolean; auth: boolean; worker: boolean }) {
  const rows = [
    { icon: Database, label: "Database", value: database ? "Supabase" : "Local", live: database, note: database ? "Connected through the transaction pooler" : "Stored in ./data/pglite — for local development only" },
    { icon: HardDrive, label: "File storage", value: storage ? "Supabase" : "Local", live: storage, note: storage ? "Statements uploaded to the private 'statements' bucket" : "Statements saved under ./data/uploads" },
    { icon: Lock, label: "Authentication", value: auth ? "Environment" : "Settings", live: auth, note: auth ? "Password set by the APP_PASSWORD environment variable; users identify themselves by name" : "Password stored in Settings → Team access; set APP_PASSWORD in production" },
    { icon: Cpu, label: "Import worker", value: worker ? "Netlify" : "Inline", live: worker, note: worker ? "Parsing runs for up to 15 minutes in the background" : "Parsing runs inside the app server process" },
  ];
  const allLive = rows.every((r) => r.live);
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Rocket className="h-4 w-4 text-muted" /> Deployment</span>} subtitle="Detected from environment variables." action={allLive ? <Badge tone="green" dot>Production</Badge> : <Badge tone="amber" dot>Local</Badge>} />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2"><r.icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-ink">{r.label}</p>
                <Badge tone={r.live ? "green" : "amber"} dot className="shrink-0">{r.value}</Badge>
              </div>
              <p className="mt-0.5 text-[12px] text-muted">{r.note}</p>
            </div>
          </li>
        ))}
      </ul>
      {!allLive && (
        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-[12px] leading-5 text-muted">
          To go live, set <code className="font-mono">DATABASE_URL</code>, <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>, <code className="font-mono">APP_PASSWORD</code> and <code className="font-mono">SESSION_SECRET</code> in Netlify environment variables. See README for the full checklist.
        </p>
      )}
    </Card>
  );
}
