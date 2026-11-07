"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, password }) });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not sign in");
        return;
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18V8l8 6 8-6v10" /></svg></span>
        <div>
          <p className="text-[16px] font-semibold">Migrizo Finance</p>
          <p className="text-[12px] text-muted">Sign in to your portal</p>
        </div>
      </div>
      <div className="space-y-4">
        <Field label="Your name" hint="Shown on every change you make, so the team can see who did what.">
          <Input required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Shailen" autoFocus />
        </Field>
        <Field label="Shared password" error={error ?? undefined}>
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>Sign in</Button>
      </div>
      <p className="mt-5 text-center text-[12px] text-muted">Everyone on the team uses the same password. It can be changed under Settings → Team access.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
