"use client";

import { useEffect, useMemo, useState } from "react";

import { BusinessProfileForm } from "./BusinessProfileForm";
import { formatPhoneForDisplay, normalizePhoneStrict } from "@/lib/phone";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";

type Me = {
  ok?: boolean;
  error?: string;
  user: { email: string; name: string; role: string; phone?: string | null } | null;
};

type WebhooksRes = {
  ok?: boolean;
  error?: string;
  baseUrl?: string;
  legacy?: {
    inboxTwilioSmsUrl?: string | null;
    aiReceptionistVoiceUrl?: string | null;
    missedCallVoiceUrl?: string | null;
  };
};

function CopyRow({ label, value }: { label: string; value: string | null | undefined }) {
  const v = value && value.trim() ? value : null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-xs font-semibold text-zinc-600">{label}</div>
      <div className="mt-2 break-all font-mono text-xs text-zinc-800">{v ?? "—"}</div>
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
          disabled={!v}
          onClick={async () => v && navigator.clipboard.writeText(v)}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

export function PortalProfileClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [webhooks, setWebhooks] = useState<WebhooksRes | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const phoneValidation = useMemo(() => {
    const res = normalizePhoneStrict(phone);
    return res;
  }, [phone]);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const canSaveContact = useMemo(() => {
    if (!me) return false;
    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextPhoneRaw = phone.trim();

    const nextPhoneRes = normalizePhoneStrict(nextPhoneRaw);
    if (!nextPhoneRes.ok) return false;
    const nextPhone = nextPhoneRes.e164 ?? "";

    const curName = me.user?.name ?? "";
    const curEmail = (me.user?.email ?? "").toLowerCase();
    const curPhone = (me.user?.phone ?? "").trim();

    const wantsNameChange = nextName !== curName;
    const wantsEmailChange = nextEmail !== curEmail;
    const wantsPhoneChange = nextPhone !== curPhone;

    if (!wantsNameChange && !wantsEmailChange && !wantsPhoneChange) return false;

    if (wantsNameChange || wantsEmailChange) {
      return currentPassword.trim().length >= 6 && nextName.length >= 2 && nextEmail.length >= 3;
    }

    return true;
  }, [me, name, email, phone, currentPassword]);

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
      const res = await fetch("/api/portal/profile", { cache: "no-store" });
      if (!mounted) return;
      if (res.ok) {
        const json = (await res.json()) as Me;
        setMe(json);
        setName(json.user?.name ?? "");
        setEmail(json.user?.email ?? "");
        setPhone(formatPhoneForDisplay(json.user?.phone ?? ""));
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Unable to load profile");
      }
      setLoading(false);
    })();

    (async () => {
      const res = await fetch("/api/portal/webhooks", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) return;
      setWebhooks(((await res.json().catch(() => null)) as WebhooksRes | null) ?? null);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function saveContact() {
    if (!canSaveContact || !me?.user) return;
    setSavingContact(true);
    setError(null);
    setNotice(null);

    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextPhoneRaw = phone.trim();
    const nextPhoneRes = normalizePhoneStrict(nextPhoneRaw);
    if (!nextPhoneRes.ok) {
      setSavingContact(false);
      setError(nextPhoneRes.error);
      return;
    }
    const nextPhone = nextPhoneRes.e164 ?? "";

    const curName = me.user.name ?? "";
    const curEmail = (me.user.email ?? "").toLowerCase();
    const curPhone = (me.user.phone ?? "").trim();

    const wantsNameChange = nextName !== curName;
    const wantsEmailChange = nextEmail !== curEmail;
    const wantsPhoneChange = nextPhone !== curPhone;

    const payload: Record<string, unknown> = {};
    if (wantsNameChange) payload.name = nextName;
    if (wantsEmailChange) payload.email = nextEmail;
    if (wantsPhoneChange) payload.phone = nextPhone;
    if (wantsNameChange || wantsEmailChange) payload.currentPassword = currentPassword;

    const res = await fetch("/api/portal/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      note?: string;
      user?: { name?: string; email?: string; phone?: string | null; role?: string } | null;
    };
    setSavingContact(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to save contact info");
      return;
    }

    setMe({
      ok: true,
      user: {
        ...me.user,
        name: json.user?.name ?? nextName,
        email: json.user?.email ?? nextEmail,
        phone: json.user?.phone ?? nextPhone,
        role: json.user?.role ?? me.user.role,
      },
    });
    setCurrentPassword("");
    setPhone(formatPhoneForDisplay(json.user?.phone ?? nextPhone));
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
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
              <div>
                <label className="text-xs font-semibold text-zinc-600">Phone (optional)</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhone(formatPhoneForDisplay(phone))}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="+1 (555) 123-4567"
                />
                {!phoneValidation.ok ? (
                  <div className="mt-1 text-xs text-red-700">{phoneValidation.error}</div>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-zinc-600">Current password (required for name/email changes)</label>
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

          <PortalSettingsSection
            title="Webhooks"
            description="Copy/paste inbound webhook URLs (token-based)."
            accent="blue"
          >
            <div className="space-y-3">
              <CopyRow label="Inbox (Twilio SMS)" value={webhooks?.legacy?.inboxTwilioSmsUrl ?? null} />
              <CopyRow label="AI Receptionist (Twilio Voice)" value={webhooks?.legacy?.aiReceptionistVoiceUrl ?? null} />
              <CopyRow label="Missed Call Text Back (Twilio Voice)" value={webhooks?.legacy?.missedCallVoiceUrl ?? null} />

              {webhooks?.baseUrl ? (
                <div className="text-xs text-zinc-500">
                  Webhook base: <span className="font-mono">{webhooks.baseUrl}</span>
                </div>
              ) : null}
            </div>
          </PortalSettingsSection>

          <BusinessProfileForm
            title="Business info"
            description="Update your business details and branding anytime."
            onSaved={() => setNotice("Business info saved.")}
          />
        </div>
      )}
    </div>
  );
}
