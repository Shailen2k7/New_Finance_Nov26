"use client";
import { useState, useTransition } from "react";
import { Sparkles, Building2, KeyRound, Trash2, Users } from "lucide-react";
import { updateSettings } from "@/lib/actions/settings";
import { CURRENCIES } from "@/lib/money";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Initial = { businessName: string; baseCurrency: string; fiscalYearStart: number; aiModel: string };

export function SettingsForm({ initial, keyStatus, passwordFromEnv }: { initial: Initial; keyStatus: "env" | "stored" | "none"; passwordFromEnv: boolean }) {
  const [form, setForm] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(keyStatus);
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();
  const toast = useToast();

  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const currencyChanged = form.baseCurrency !== initial.baseCurrency;
    start(async () => {
      try {
        if (password && password.length < 6) {
          toast.error("Shared password must be at least 6 characters");
          return;
        }
        const res = await updateSettings({ ...form, anthropicApiKey: apiKey.trim() || null, sharedPassword: password || null });
        if (apiKey.trim()) setStatus("stored");
        setApiKey("");
        setPassword("");
        toast.success("Settings saved", currencyChanged ? `${res.recomputed} transactions re-converted to ${form.baseCurrency}` : undefined);
      } catch (err) {
        toast.error("Could not save settings", (err as Error).message);
      }
    });
  };

  const removeKey = () =>
    startRemove(async () => {
      try {
        await updateSettings({ ...form, anthropicApiKey: "CLEAR" });
        setStatus("none");
        toast.success("API key removed", "AI statement parsing is now disabled");
      } catch (err) {
        toast.error("Could not remove key", (err as Error).message);
      }
    });

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted" /> Business</span>} subtitle="Shown in the sidebar and used for all reports." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business name" className="sm:col-span-2">
            <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
          </Field>
          <Field label="Base currency" hint="Every transaction is also stored converted to this currency using the FX rate on its date. Changing it re-converts all existing transactions.">
            <Select value={form.baseCurrency} onChange={(e) => set("baseCurrency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fiscal year starts in">
            <Select value={form.fiscalYearStart} onChange={(e) => set("fiscalYearStart", Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted" /> AI statement parsing</span>}
          subtitle="Powers the smart import: reads PDF, image, CSV and Excel statements, verifies totals and categorizes every line."
          action={
            status === "env" ? <Badge tone="green" dot>Configured via environment</Badge>
            : status === "stored" ? <Badge tone="green" dot>Configured</Badge>
            : <Badge tone="amber" dot>Not configured</Badge>
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Anthropic API key" className="sm:col-span-2" hint={status === "env" ? "The key is provided by the ANTHROPIC_API_KEY environment variable and takes precedence over a stored key." : status === "stored" ? "A key is stored securely. Enter a new one to replace it; leave blank to keep it." : "Create a key at console.anthropic.com and paste it here. It is stored in your database and never shown again."}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status === "none" ? "sk-ant-…" : "••••••••••••••••  (unchanged)"} className="pl-9" disabled={status === "env"} />
              </div>
              {status === "stored" && (
                <Button type="button" variant="outline" onClick={removeKey} loading={removing}><Trash2 className="h-4 w-4" /> Remove key</Button>
              )}
            </div>
          </Field>
          <Field label="AI model" hint="Opus gives the highest extraction accuracy; Sonnet is faster and cheaper.">
            <Select value={form.aiModel} onChange={(e) => set("aiModel", e.target.value)}>
              <option value="claude-opus-5-5">Claude Opus 5.5 (recommended)</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (faster)</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-muted" /> Team access</span>}
          subtitle="Everyone signs in with the same shared password and types their own name. Every change is recorded against that name in Activity."
          action={passwordFromEnv ? <Badge tone="green" dot>Set by environment</Badge> : <Badge tone="blue" dot>Managed here</Badge>}
        />
        <Field label="Shared password" hint={passwordFromEnv ? "Set by the APP_PASSWORD environment variable — cannot be changed here." : "Minimum 6 characters. Leave blank to keep the current password. Share the new password with the team after saving."}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={passwordFromEnv ? "Managed by APP_PASSWORD" : "New shared password"} disabled={passwordFromEnv} />
        </Field>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={pending} size="lg">Save settings</Button>
      </div>
    </form>
  );
}
