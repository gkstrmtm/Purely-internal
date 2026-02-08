"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

function safeInternalPath(raw: string | null | undefined, fallback: string) {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export default function PortalLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromRaw = searchParams.get("from");
  const from = useMemo(() => safeInternalPath(fromRaw, "/portal/app"), [fromRaw]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/portal/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Invalid email or password");
      return;
    }

    router.push(from);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex justify-center">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={520}
              height={160}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </div>

          <h1 className="mt-6 text-xl font-semibold text-zinc-900">Client Portal Login</h1>
          <p className="mt-2 text-base text-zinc-600">Sign in to your client portal.</p>

          <form className="mt-6 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="text-base font-medium">Email</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="text-base font-medium">Password</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            <button
              className="w-full rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 text-base text-zinc-600">
            Need an account?{" "}
            <Link className="font-medium text-brand-ink hover:underline" href="/portal/get-started">
              Get started
            </Link>
          </div>

          <div className="mt-3 text-base text-zinc-600">
            Employee?{" "}
            <Link className="font-medium text-brand-ink hover:underline" href="/employeelogin">
              Log in as an employee
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
