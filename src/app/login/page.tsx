"use client";

import { FormEvent, useState } from "react";
import { Building, Lock } from "lucide-react";
import { api } from "@/lib/client/api";
import { rememberCompany } from "@/lib/client/company";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export default function LoginPage() {
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ company: string }>("/api/login", { body: { company, password } });
      rememberCompany(res.company);
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in");
      setBusy(false);
    }
  }

  const input =
    "h-14 w-full rounded-xl border border-line-strong bg-paper pr-4 pl-12 text-lg text-ink outline-none placeholder:text-ink-faint focus:border-clay focus:ring-4 focus:ring-clay/20";

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(90%_60%_at_50%_0%,#f6e3d6_0%,transparent_70%)] px-4 py-10">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <Logo className="mx-auto size-20" />
          <h1 className="mt-4 font-display text-3xl font-semibold text-ink">Bill Book</h1>
          <p className="mt-1 text-ink-soft">Scan bills. Check them. Done.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-paper p-6 shadow-card">
          <label className="block">
            <span className="mb-1.5 block font-medium text-ink-soft">Company name</span>
            <span className="relative block">
              <Building className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-faint" />
              <input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" required className={input} />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block font-medium text-ink-soft">4-digit password</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-faint" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 4))}
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                placeholder="••••"
                required
                className={`${input} tracking-[0.5em]`}
              />
            </span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" size="lg" full loading={busy} disabled={password.length !== 4 || !company.trim()}>
            Open Bill Book
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-faint">You stay logged in on this phone for 90 days.</p>
      </div>
    </main>
  );
}
