"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { IconEyeGlyph, IconEyeOffGlyph } from "@/app/portal/PortalIcons";
import { useToast } from "@/components/ToastProvider";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

function safeInternalPath(raw: string | null | undefined, fallback: string) {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

type ResetChannel = "email" | "sms";
type ResetStage = "intro" | "request" | "code" | "password";

export default function PortalLoginClient() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const toast = useToast();

  const pathnameVariant = useMemo(() => (pathname.startsWith("/credit") ? "credit" : "portal"), [pathname]);
  const logoSrc = useMemo(
    () => (pathnameVariant === "credit" ? "/brand/2.png" : "/brand/1.png"),
    [pathnameVariant],
  );

  const fromRaw = searchParams.get("from");
  // Default landing should stay inside the active variant.
  const defaultFrom = useMemo(() => (pathnameVariant === "credit" ? "/credit/app" : "/portal/app"), [pathnameVariant]);
  const from = useMemo(() => safeInternalPath(fromRaw, defaultFrom), [fromRaw, defaultFrom]);
  const portalVariant = useMemo(() => (pathnameVariant === "credit" || from.startsWith("/credit") ? "credit" : "portal"), [from, pathnameVariant]);
  const apiBase = useMemo(() => (portalVariant === "credit" ? "/credit" : "/portal"), [portalVariant]);
  const loginTitle = portalVariant === "credit" ? "Purely Credit Login" : "Purely Portal Login";
  const loginSubtitle = portalVariant === "credit" ? "Sign in to your Purely Credit account." : "Sign in to your Purely portal account.";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [failedOnce, setFailedOnce] = useState(false);
  const [resetChannel, setResetChannel] = useState<ResetChannel>("email");
  const [resetStage, setResetStage] = useState<ResetStage>("intro");
  const [availableResetChannels, setAvailableResetChannels] = useState<ResetChannel[]>([]);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch(`${apiBase}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!res.ok) {
      toast.error("Incorrect email or password");
      setFailedOnce(true);
      setResetStage("intro");
      return;
    }

    const json = (await res.json().catch(() => null)) as { ok?: boolean; defaultFrom?: string | null } | null;
    const preferredFrom = safeInternalPath(json?.defaultFrom, defaultFrom);

    // Hard navigation ensures the new session cookie is applied for the next request.
    window.location.assign(fromRaw ? from : preferredFrom);
  }

  async function loadResetOptions() {
    if (!email.trim()) {
      toast.error("Enter your email above first.");
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/forgot-password/options`, {
        method: "POST",
        headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; channels?: ResetChannel[] } | null;
      if (!res.ok || !json?.ok || !json.channels?.length) {
        toast.error(json?.error || "No reset options found for that email.");
        return;
      }
      setAvailableResetChannels(json.channels);
      setResetChannel(json.channels[0] || "email");
      setResetStage("request");
    } catch {
      toast.error("Unable to continue right now.");
    } finally {
      setResetLoading(false);
    }
  }

  async function requestResetCode() {
    if (!email.trim()) {
      toast.error("Enter your email above first.");
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/forgot-password/request`, {
        method: "POST",
        headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
        body: JSON.stringify({ email: email.trim(), channel: resetChannel }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Unable to send code right now.");
        return;
      }
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setResetStage("code");
      toast.success(`Code sent by ${resetChannel === "sms" ? "text" : "email"}.`);
    } catch {
      toast.error("Unable to send code right now.");
    } finally {
      setResetLoading(false);
    }
  }

  async function verifyResetCode() {
    if (!resetCode.trim()) {
      toast.error("Enter the code.");
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/forgot-password/verify`, {
        method: "POST",
        headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
        body: JSON.stringify({ email: email.trim(), code: resetCode.trim() }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Invalid code.");
        return;
      }
      setResetStage("password");
      toast.success("Code accepted. Choose your new password.");
    } catch {
      toast.error("Unable to verify the code right now.");
    } finally {
      setResetLoading(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
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
      const res = await fetch(`${apiBase}/api/forgot-password/reset`, {
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
      setAvailableResetChannels([]);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setFailedOnce(false);
      setResetStage("intro");
    } catch {
      toast.error("Unable to reset password right now.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex justify-center">
            <Image
              src={logoSrc}
              alt="Purely Automation"
              width={520}
              height={160}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </div>

          <h1 className="mt-6 text-xl font-semibold text-zinc-900">{loginTitle}</h1>
          <p className="mt-2 text-base text-zinc-600">{loginSubtitle}</p>

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
              <div className="relative mt-2">
                <input
                  className={`w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400 ${password ? "pr-24" : ""}`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPassword(next);
                    if (!next) setShowPassword(false);
                  }}
                  autoComplete="current-password"
                  required
                />
                {password ? (
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute inset-y-1.5 right-1.5 inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:border-zinc-300 hover:bg-zinc-50"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <IconEyeOffGlyph size={16} className="mr-2" /> : <IconEyeGlyph size={16} className="mr-2" />}
                    {showPassword ? "Hide" : "Show"}
                  </button>
                ) : null}
              </div>
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
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-zinc-900">Forgot password?</div>
                {resetStage !== "intro" ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-brand-ink hover:underline"
                    onClick={() => {
                      setResetStage("intro");
                      setResetCode("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Back
                  </button>
                ) : null}
              </div>

              <div className="mt-4 flex items-center gap-2">
                {(["request", "code", "password"] as ResetStage[]).map((step) => {
                  const active = resetStage === step;
                  const complete =
                    (step === "request" && (resetStage === "code" || resetStage === "password")) ||
                    (step === "code" && resetStage === "password");
                  return (
                    <div
                      key={step}
                      className={`h-2 flex-1 rounded-full ${active || complete ? "bg-brand-blue" : "bg-brand-blue/15"}`}
                    />
                  );
                })}
              </div>

              {resetStage === "intro" ? (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={resetLoading || !email.trim()}
                    className="w-full rounded-2xl bg-brand-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    onClick={() => void loadResetOptions()}
                  >
                    {resetLoading ? "Checking…" : "Reset password"}
                  </button>
                </div>
              ) : null}

              {resetStage === "request" ? (
                <div className="mt-4 space-y-4">
                  <div className="text-sm font-semibold text-zinc-900">Choose delivery method</div>
                  <div className={`grid gap-2 ${availableResetChannels.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {availableResetChannels.includes("email") ? (
                      <button
                        type="button"
                        onClick={() => setResetChannel("email")}
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-150 ${
                          resetChannel === "email"
                            ? "border-brand-blue/35 bg-brand-blue/10 text-brand-blue"
                            : "border-brand-blue/15 bg-white text-zinc-900 hover:border-brand-blue/25 hover:bg-brand-blue/5"
                        }`}
                      >
                        Email
                      </button>
                    ) : null}
                    {availableResetChannels.includes("sms") ? (
                      <button
                        type="button"
                        onClick={() => setResetChannel("sms")}
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-150 ${
                          resetChannel === "sms"
                            ? "border-brand-blue/35 bg-brand-blue/10 text-brand-blue"
                            : "border-brand-blue/15 bg-white text-zinc-900 hover:border-brand-blue/25 hover:bg-brand-blue/5"
                        }`}
                      >
                        Text message
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    disabled={resetLoading || !email.trim()}
                    className="w-full rounded-2xl bg-brand-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    onClick={() => void requestResetCode()}
                  >
                    {resetLoading ? "Sending…" : "Continue"}
                  </button>
                </div>
              ) : null}

              {resetStage === "code" ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-brand-blue/20 bg-brand-blue/10 px-3 py-1 text-xs font-semibold text-brand-blue">
                      {resetChannel === "sms" ? "Text message" : "Email"}
                    </span>
                    <button
                      type="button"
                      className="text-sm font-semibold text-brand-ink hover:underline"
                      onClick={() => {
                        setResetStage("request");
                        setResetCode("");
                      }}
                    >
                      Change
                    </button>
                  </div>

                  <div className="grid gap-2">
                    <input
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="6-digit code"
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      disabled={resetLoading || !resetCode.trim()}
                      className="flex-1 rounded-2xl bg-brand-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                      onClick={() => void verifyResetCode()}
                    >
                      {resetLoading ? "Checking…" : "Continue"}
                    </button>
                    <button
                      type="button"
                      disabled={resetLoading || !email.trim()}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                      onClick={() => void requestResetCode()}
                    >
                      Resend code
                    </button>
                  </div>
                </div>
              ) : null}

              {resetStage === "password" ? (
                <form className="mt-4 grid gap-3" onSubmit={submitNewPassword}>
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-zinc-900">New password</label>
                    <div className="relative">
                      <input
                        className={`w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400 ${newPassword ? "pr-24" : ""}`}
                        type={showNewPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => {
                          const next = e.target.value;
                          setNewPassword(next);
                          if (!next) setShowNewPassword(false);
                        }}
                        placeholder="Minimum 8 characters"
                      />
                      {newPassword ? (
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((current) => !current)}
                          className="absolute inset-y-1.5 right-1.5 inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:border-zinc-300 hover:bg-zinc-50"
                          aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                        >
                          {showNewPassword ? <IconEyeOffGlyph size={16} className="mr-2" /> : <IconEyeGlyph size={16} className="mr-2" />}
                          {showNewPassword ? "Hide" : "Show"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-zinc-900">Confirm password</label>
                    <div className="relative">
                      <input
                        className={`w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none ring-0 focus:border-zinc-400 ${confirmPassword ? "pr-24" : ""}`}
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => {
                          const next = e.target.value;
                          setConfirmPassword(next);
                          if (!next) setShowConfirmPassword(false);
                        }}
                      />
                      {confirmPassword ? (
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((current) => !current)}
                          className="absolute inset-y-1.5 right-1.5 inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:border-zinc-300 hover:bg-zinc-50"
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        >
                          {showConfirmPassword ? <IconEyeOffGlyph size={16} className="mr-2" /> : <IconEyeGlyph size={16} className="mr-2" />}
                          {showConfirmPassword ? "Hide" : "Show"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="mt-1 w-full rounded-2xl bg-brand-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {resetLoading ? "Resetting…" : "Reset password"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 text-base text-zinc-600">
            Need an account?{" "}
            <Link className="font-medium text-brand-ink hover:underline" href={portalVariant === "credit" ? "/credit/get-started" : "/portal/get-started"}>
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
