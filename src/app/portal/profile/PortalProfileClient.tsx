"use client";

import { useEffect, useMemo, useState } from "react";

type Me = {
  user: { email: string; name: string; role: string };
};

export function PortalProfileClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const canSaveContact = useMemo(() => {
    if (!me) return false;
    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();
    const changed = nextName !== (me.user.name ?? "") || nextEmail !== (me.user.email ?? "").toLowerCase();
    return changed && currentPassword.trim().length >= 6 && nextName.length >= 2 && nextEmail.length >= 3;
  }, [me, name, email, currentPassword]);

  const canSavePassword = useMemo(() => {
    return (
      pwCurrent.trim().length >= 6 &&
      pwNext.trim().length >= 8 &&
      pwConfirm.trim().length >= 8 &&
      pwNext === pwConfirm
    );
  }, [pwCurrent, pwNext, pwConfirm]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/customer/me", { cache: "no-store" });
      if (!mounted) return;
      if (res.ok) {
        const json = (await res.json()) as Me;
        setMe(json);
        setName(json.user.name ?? "");
        setEmail(json.user.email ?? "");
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function saveContact() {
    if (!canSaveContact || !me) return;
    setSavingContact(true);
    setError(null);
    setNotice(null);

    const res = await fetch("/api/portal/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        currentPassword,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string; user?: { name?: string; email?: string } };
    setSavingContact(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to save contact info");
      return;
    }

    setMe({ user: { ...me.user, name: json.user?.name ?? name.trim(), email: json.user?.email ?? email.trim() } });
    setCurrentPassword("");
    setNotice(json.note ?? "Saved. You may need to sign out/in to refresh your session.");
  }

  async function changePassword() {
    if (!canSavePassword) return;
    setSavingPassword(true);
    setError(null);
    setNotice(null);

    const res = await fetch("/api/portal/profile/password", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: pwCurrent,
        newPassword: pwNext,
        confirmPassword: pwConfirm,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string };
    setSavingPassword(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to update password");
      return;
    }

    setPwCurrent("");
    setPwNext("");
    setPwConfirm("");
    setNotice(json.note ?? "Password updated.");
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Profile</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Account details and security.
      </p>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Loading…
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
            <div className="text-sm font-semibold text-zinc-900">Contact</div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-600">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="you@example.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-zinc-600">Confirm with current password</label>
                <input
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  type="password"
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Current password"
                />
                <div className="mt-2 text-xs text-zinc-500">
                  This prevents someone who’s already logged in from changing your account details without your password.
                </div>
              </div>
            </div>

            {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
            {notice ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div> : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={saveContact}
                disabled={!canSaveContact || savingContact}
              >
                {savingContact ? "Saving…" : "Save contact info"}
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Change password</div>
              <div className="mt-1 text-sm text-zinc-600">Update your password for this account.</div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-zinc-600">Current password</label>
                  <input
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    type="password"
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    placeholder="Current password"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-600">New password</label>
                  <input
                    value={pwNext}
                    onChange={(e) => setPwNext(e.target.value)}
                    type="password"
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Confirm new password</label>
                  <input
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    type="password"
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    placeholder="Repeat new password"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={changePassword}
                  disabled={!canSavePassword || savingPassword}
                  className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {savingPassword ? "Updating…" : "Update password"}
                </button>
                <div className="text-xs text-zinc-500 sm:self-center">
                  After updating, sign out/in on other devices.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">Security</div>
            <div className="mt-2 text-sm text-zinc-600">
              Keep your account secure.
            </div>
            <div className="mt-5 space-y-2 text-sm text-zinc-700">
              <div>• Use a strong password</div>
              <div>• Don’t share logins</div>
              <div>• Sign out on shared devices</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
