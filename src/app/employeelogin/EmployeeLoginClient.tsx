"use client";

import Image from "next/image";
import Link from "next/link";
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
  const from = useMemo(() => safeInternalPath(fromRaw, "/app"), [fromRaw]);

  const shouldSwitch = searchParams.get("switch") === "1";
  const [switching, setSwitching] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [failedOnce, setFailedOnce] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
    setAuthError("");
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      setLoading(false);

      if (!res) {
        const message = "Sign-in is temporarily unavailable. Please try again.";
        setAuthError(message);
        toast.error(message);
        return;
      }

      if (res.error) {
        if (res.error === "CredentialsSignin") {
          const message = "Incorrect email or password.";
          setAuthError(message);
          setFailedOnce(true);
          toast.error(message);
          return;
        }

        const message = "Sign-in is temporarily unavailable. Please contact support.";
        setAuthError(message);
        toast.error(message);
        return;
      }

      router.push(from);
      router.refresh();
    } catch {
      setLoading(false);
      const message = "Unable to reach the sign-in service right now. Please try again.";
      setAuthError(message);
      toast.error(message);
    }
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex justify-center">
            <Image
              src="/brand/1.png"
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (authError) setAuthError("");
                }}
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
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (authError) setAuthError("");
                }}
                autoComplete="current-password"
                required
              />
            </div>

            {authError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
                <div className="font-semibold">Sign-in failed</div>
                <div className="mt-1">{authError}</div>
                <div className="mt-2 text-rose-800">
                  If this is a client account, try <Link className="font-semibold underline underline-offset-4" href="/portal/login">Portal Login</Link> or <Link className="font-semibold underline underline-offset-4" href="/credit/login">Purely Credit Login</Link>.
                </div>
              </div>
            ) : null}

            <button
              className="w-full rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={loading || switching}
              type="submit"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {failedOnce ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="text-base font-semibold text-zinc-900">Forgot password?</div>
              <div className="mt-1 text-sm text-zinc-600">
                Send a one-time code to your email, then choose a new password for your employee account.
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
                      await fetch(`/api/auth/forgot-password/request`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
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
                    setAuthError("");
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
                      const res = await fetch(`/api/auth/forgot-password/reset`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
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
                      placeholder="Re-enter new password"
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
            <Link className="font-medium text-brand-ink hover:underline" href="/signup">
              Use invite signup
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
