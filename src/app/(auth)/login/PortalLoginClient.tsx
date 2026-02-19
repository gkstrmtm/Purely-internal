"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

function safeInternalPath(raw: string | null | undefined, fallback: string) {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export default function PortalLoginClient() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const toast = useToast();

  const pathnameVariant = useMemo(() => (pathname.startsWith("/credit") ? "credit" : "portal"), [pathname]);

  const fromRaw = searchParams.get("from");
  const defaultFrom = useMemo(() => (pathnameVariant === "credit" ? "/credit/app" : "/portal/app"), [pathnameVariant]);
  const from = useMemo(() => safeInternalPath(fromRaw, defaultFrom), [fromRaw, defaultFrom]);
  const portalVariant = useMemo(() => (pathnameVariant === "credit" || from.startsWith("/credit") ? "credit" : "portal"), [from, pathnameVariant]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [failedOnce, setFailedOnce] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/portal/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!res.ok) {
      toast.error("Incorrect username or incorrect password");
      setFailedOnce(true);
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

            <button
              className="w-full rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {failedOnce ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="text-base font-semibold text-zinc-900">Forgot password?</div>
              <div className="mt-1 text-sm text-zinc-600">
                Send a one-time code to your email and phone (if configured), then choose a new password.
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  disabled={resetLoading || !email.trim()}
                  className="rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  onClick={async () => {
                    if (!email.trim()) {
                      toast.error("Enter your email above first.");
                      return;
                    }
                    setResetLoading(true);
                    try {
                      await fetch("/portal/api/forgot-password/request", {
                        method: "POST",
                        headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
                        body: JSON.stringify({ email: email.trim() }),
                      });
                      setResetRequested(true);
                      toast.success("If that account exists, a code was sent.");
                    } catch {
                      toast.error("Unable to send code right now.");
                    } finally {
                      setResetLoading(false);
                    }
                  }}
                >
                  {resetLoading ? "Sending…" : resetRequested ? "Resend code" : "Send code"}
                </button>

                <button
                  type="button"
                  className="rounded-2xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                  onClick={() => {
                    setResetRequested(false);
                    setResetCode("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  clear
                </button>
              </div>

              {resetRequested ? (
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!resetCode.trim()) {
                      toast.error("Enter the code.");
                      return;
                    }
                    if (newPassword.length < 8) {
                      toast.error("Password must be at least 8 characters.");
                      return;
                    }
                    if (newPassword !== confirmPassword) {
                      toast.error("Passwords do not match.");
                      return;
                    }

                    setResetLoading(true);
                    try {
                      const res = await fetch("/portal/api/forgot-password/reset", {
                        method: "POST",
                        headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
                        body: JSON.stringify({
                          email: email.trim(),
                          code: resetCode.trim(),
                          newPassword,
                        }),
                      });
                      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
                      if (!res.ok || !json?.ok) {
                        toast.error(json?.error || "Invalid code.");
                        return;
                      }

                      toast.success("Password updated. You can sign in now.");
                      setPassword("");
                      setResetCode("");
                      setNewPassword("");
                      setConfirmPassword("");
                    } catch {
                      toast.error("Unable to reset password right now.");
                    } finally {
                      setResetLoading(false);
                    }
                  }}
                >
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-zinc-900">code</label>
                    <input
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="6-digit code"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-zinc-900">new password</label>
                    <input
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-zinc-900">confirm password</label>
                    <input
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="mt-1 rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-950 disabled:opacity-60"
                  >
                    {resetLoading ? "Resetting…" : "Reset password"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

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
