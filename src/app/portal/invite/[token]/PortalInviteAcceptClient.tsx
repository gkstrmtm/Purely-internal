"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type InviteJson = {
  email: string;
  role: string;
  expiresAtIso: string | null;
  acceptedAtIso: string | null;
};

export function PortalInviteAcceptClient({
  token,
  invite,
}: {
  token: string;
  invite: InviteJson | null;
}) {
  const toast = useToast();
  const lastAutoToastRef = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = useMemo(() => {
    if (!invite) return { ok: false, reason: "Invite not found" as const };
    if (invite.acceptedAtIso) return { ok: false, reason: "Invite already used" as const };
    const exp = invite.expiresAtIso ? new Date(invite.expiresAtIso).getTime() : 0;
    if (exp && exp < Date.now()) return { ok: false, reason: "Invite expired" as const };
    return { ok: true as const };
  }, [invite]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    const msg = !invite ? "Invite not found." : !state.ok ? state.reason : null;
    if (!msg) return;
    if (lastAutoToastRef.current === msg) return;
    lastAutoToastRef.current = msg;
    toast.error(msg);
  }, [invite, state, toast]);

  async function accept() {
    setError(null);
    if (!invite) return;
    if (!state.ok) return;

    const safeName = name.trim();
    if (!safeName) {
      setError("Please enter your name.");
      return;
    }
    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/public/portal-invite/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name: safeName, password }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Failed to accept invite"));
      }

      window.location.href = "/portal/app";
    } catch (e: any) {
      setError(String(e?.message || "Failed to accept invite"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <Link href="/" className="text-sm font-semibold text-brand-ink hover:underline">
          ← Back
        </Link>

        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-brand-ink">Accept invite</h1>
          <p className="mt-2 text-sm text-zinc-600">Join a client portal account.</p>

          {!invite ? (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">Invite not found.</div>
          ) : !state.ok ? (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">{state.reason}</div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Invite details</div>
                <div className="mt-2 text-sm text-zinc-800">
                  <div>
                    <span className="font-semibold">Email:</span> {invite.email}
                  </div>
                  <div className="mt-1">
                    <span className="font-semibold">Role:</span> {invite.role}
                  </div>
                  {invite.expiresAtIso ? (
                    <div className="mt-1 text-xs text-zinc-500">Expires {new Date(invite.expiresAtIso).toLocaleString()}</div>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-700">Your name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-700">Create password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => accept()}
                className={classNames(
                  "w-full rounded-2xl px-4 py-2 text-sm font-semibold",
                  busy ? "cursor-not-allowed bg-zinc-200 text-zinc-600" : "bg-[color:var(--color-brand-blue)] text-white hover:brightness-95",
                )}
              >
                {busy ? "Accepting…" : "Accept invite"}
              </button>

              <div className="text-center text-xs text-zinc-500">
                Already have an account?{" "}
                <Link href="/login?from=%2Fportal%2Fapp" className="font-semibold text-brand-ink hover:underline">
                  Log in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
