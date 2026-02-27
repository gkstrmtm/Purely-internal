"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdsLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/ads/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(String(json?.error || "Login failed"));
      router.push("/ads/app");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message || "Login failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-brand-mist text-brand-ink">
      <div className="mx-auto max-w-md px-6 py-14">
        <Link href="/ads" className="text-sm font-semibold text-zinc-700 hover:underline">
          ← Back
        </Link>

        <h1 className="mt-6 text-2xl font-bold">Ads Manager sign in</h1>
        <p className="mt-2 text-sm text-zinc-600">Use the same credentials as your portal account.</p>

        <form onSubmit={onSubmit} className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
            />
          </label>

          <label className="mt-4 block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
            />
          </label>

          {error ? <div className="mt-4 text-sm font-medium text-red-600">{error}</div> : null}

          <button
            disabled={busy}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div className="mt-4 text-center text-sm text-zinc-600">
            New here?{" "}
            <Link href="/ads/signup" className="font-semibold text-zinc-900 hover:underline">
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
