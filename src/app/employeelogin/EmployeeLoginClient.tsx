"use client";

import Image from "next/image";
import { signIn, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";

function safeInternalPath(raw: string | null | undefined, fallback: string) {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  // Avoid protocol-relative URLs
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export default function EmployeeLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const fromRaw = searchParams.get("from");
  const from = useMemo(() => safeInternalPath(fromRaw, "/dashboard"), [fromRaw]);

  const shouldSwitch = searchParams.get("switch") === "1";
  const [switching, setSwitching] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shouldSwitch) return;
    let cancelled = false;
    setSwitching(true);
    void signOut({ redirect: false })
      .catch(() => null)
      .finally(() => {
        if (cancelled) return;
        setSwitching(false);
        router.refresh();
      });
    return () => {
      cancelled = true;
    };
  }, [router, shouldSwitch]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    setLoading(false);

    if (!res || res.error) {
      toast.error("Incorrect username or incorrect password");
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

          <h1 className="mt-6 text-xl font-semibold text-zinc-900">Employee Login</h1>
          <p className="mt-2 text-base text-zinc-600">Sign in to the employee dashboard.</p>

          {switching ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Switching accounts…
            </div>
          ) : null}

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

            <button
              className="w-full rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={loading || switching}
              type="submit"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 text-base text-zinc-600">
            Need an account?{" "}
            <a className="font-medium text-brand-ink hover:underline" href="/signup">
              Use invite signup
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
