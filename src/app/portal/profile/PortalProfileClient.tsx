"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";

import { BusinessProfileForm } from "./BusinessProfileForm";
import { formatPhoneForDisplay, normalizePhoneStrict } from "@/lib/phone";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";

type Me = {
  ok?: boolean;
  error?: string;
  user: {
    email: string;
    name: string;
    role: string;
    phone?: string | null;
    voiceAgentId?: string | null;
    voiceAgentApiKeyConfigured?: boolean;
  } | null;
};

type TwilioMasked = {
  configured: boolean;
  accountSidMasked: string | null;
  fromNumberE164: string | null;
  hasAuthToken: boolean;
  updatedAtIso: string | null;
};

type TwilioApiPayload = {
  ok: boolean;
  twilio: TwilioMasked;
  note?: string;
  error?: string;
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

type PortalMe =
  | {
      ok: true;
      ownerId: string;
      memberId: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
      permissions: Record<string, { view: boolean; edit: boolean }>;
    }
  | { ok: false; error?: string };

type MailboxRes =
  | {
      ok: true;
      mailbox: {
        emailAddress: string;
        localPart: string;
        canChange: boolean;
      } | null;
    }
  | { ok: false; error?: string };

type Mailbox = {
  emailAddress: string;
  localPart: string;
  canChange: boolean;
};

function CopyRow({ label, value }: { label: string; value: string | null | undefined }) {
  const v = value && value.trim() ? value : null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-xs font-semibold text-zinc-600">{label}</div>
      <div className="mt-2 break-all font-mono text-xs text-zinc-800">{v ?? "N/A"}</div>
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
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [portalMe, setPortalMe] = useState<PortalMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [webhooks, setWebhooks] = useState<WebhooksRes | null>(null);

  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [mailboxLoading, setMailboxLoading] = useState(false);
  const [mailboxSaving, setMailboxSaving] = useState(false);
  const [mailboxError, setMailboxError] = useState<string | null>(null);
  const [mailboxNote, setMailboxNote] = useState<string | null>(null);
  const [mailboxLocalPart, setMailboxLocalPart] = useState<string>("");

  const [twilioMasked, setTwilioMasked] = useState<TwilioMasked | null>(null);
  const [twilioAccountSid, setTwilioAccountSid] = useState<string>("");
  const [twilioAuthToken, setTwilioAuthToken] = useState<string>("");
  const [twilioFromNumber, setTwilioFromNumber] = useState<string>("");
  const [savingTwilio, setSavingTwilio] = useState(false);
  const [twilioError, setTwilioError] = useState<string | null>(null);
  const [twilioNote, setTwilioNote] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [voiceAgentId, setVoiceAgentId] = useState("");
  const [voiceAgentApiKey, setVoiceAgentApiKey] = useState("");
  const [voiceAgentApiKeyConfigured, setVoiceAgentApiKeyConfigured] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const phoneValidation = useMemo(() => {
    const res = normalizePhoneStrict(phone);
    return res;
  }, [phone]);

  const canViewWebhooks = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.webhooks?.view) : false;
  const canViewTwilio = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.twilio?.view) : false;
  const canEditTwilio = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.twilio?.edit) : false;
  const canViewBusinessInfo = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.businessProfile?.view) : false;
  const canEditBusinessInfo = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.businessProfile?.edit) : false;

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (twilioError) toast.error(twilioError);
  }, [twilioError, toast]);

  useEffect(() => {
    if (mailboxError) toast.error(mailboxError);
  }, [mailboxError, toast]);

  useEffect(() => {
    if (!phoneValidation.ok) toast.error(phoneValidation.error);
  }, [phoneValidation, toast]);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const canSaveContact = useMemo(() => {
    if (!me) return false;
    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextPhoneRaw = phone.trim();
    const nextVoiceAgentId = voiceAgentId.trim();

    const nextPhoneRes = normalizePhoneStrict(nextPhoneRaw);
    if (!nextPhoneRes.ok) return false;
    const nextPhone = nextPhoneRes.e164 ?? "";

    const curName = me.user?.name ?? "";
    const curEmail = (me.user?.email ?? "").toLowerCase();
    const curPhone = (me.user?.phone ?? "").trim();
    const curVoiceAgentId = (me.user?.voiceAgentId ?? "").trim();
    const wantsNameChange = nextName !== curName;
    const wantsEmailChange = nextEmail !== curEmail;
    const wantsPhoneChange = nextPhone !== curPhone;
    const wantsVoiceAgentIdChange = nextVoiceAgentId !== curVoiceAgentId;
    const wantsVoiceAgentApiKeyChange = Boolean(voiceAgentApiKey.trim());

    if (!wantsNameChange && !wantsEmailChange && !wantsPhoneChange && !wantsVoiceAgentIdChange && !wantsVoiceAgentApiKeyChange) {
      return false;
    }

    if (wantsNameChange || wantsEmailChange) {
      return currentPassword.trim().length >= 6 && nextName.length >= 2 && nextEmail.length >= 3;
    }

    // No password required for phone/agent id/api key updates.
    return true;
  }, [me, name, email, phone, voiceAgentId, voiceAgentApiKey, currentPassword]);

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
        setVoiceAgentId(json.user?.voiceAgentId ?? "");
        setVoiceAgentApiKeyConfigured(Boolean(json.user?.voiceAgentApiKeyConfigured));
      } else {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Unable to load profile");
      }
      setLoading(false);
    })();

    (async () => {
      const res = await fetch("/api/portal/me", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) {
        setPortalMe({ ok: false, error: "Forbidden" });
        return;
      }
      const json = ((await res.json().catch(() => null)) as PortalMe | null) ?? null;
      setPortalMe(json);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!portalMe || portalMe.ok !== true) return;

    (async () => {
      if (!canViewWebhooks) {
        if (mounted) setWebhooks(null);
        return;
      }
      const res = await fetch("/api/portal/webhooks", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) return;
      setWebhooks(((await res.json().catch(() => null)) as WebhooksRes | null) ?? null);
    })();

    (async () => {
      if (!canViewTwilio) {
        if (mounted) setTwilioMasked(null);
        return;
      }
      const res = await fetch("/api/portal/integrations/twilio", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) return;
      const json = ((await res.json().catch(() => null)) as TwilioApiPayload | null) ?? null;
      if (json?.ok && json.twilio) {
        setTwilioMasked(json.twilio);
        setTwilioFromNumber(json.twilio.fromNumberE164 ?? "");
      }
    })();

    (async () => {
      setMailboxLoading(true);
      setMailboxError(null);
      const res = await fetch("/api/portal/mailbox", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;

      if (!res?.ok) {
        const json = (await res?.json().catch(() => ({}))) as { error?: string };
        setMailbox(null);
        setMailboxError(json.error ?? "Unable to load business email");
        setMailboxLoading(false);
        return;
      }

      const json = ((await res.json().catch(() => null)) as MailboxRes | null) ?? null;
      if (json?.ok) {
        setMailbox(json.mailbox ?? null);
        setMailboxLocalPart(json.mailbox?.localPart ?? "");
      } else {
        setMailbox(null);
        setMailboxError((json as any)?.error ?? "Unable to load business email");
      }
      setMailboxLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [portalMe, canViewWebhooks, canViewTwilio]);

  const canSaveMailbox = useMemo(() => {
    if (!mailbox || !mailbox.canChange) return false;
    const next = mailboxLocalPart.trim();
    if (next.length < 2) return false;
    if (next.toLowerCase() === String(mailbox.localPart || "").toLowerCase()) return false;
    return true;
  }, [mailbox, mailboxLocalPart]);

  async function saveMailboxOnce() {
    if (!mailbox?.canChange) {
      setMailboxError("This business email is locked.");
      return;
    }

    setMailboxSaving(true);
    setMailboxError(null);
    setMailboxNote(null);

    const res = await fetch("/api/portal/mailbox", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPart: mailboxLocalPart }),
    });

    const json = (await res.json().catch(() => ({}))) as any;
    setMailboxSaving(false);

    if (!res.ok || !json?.ok) {
      setMailboxError(json?.error ?? "Unable to update business email");
      return;
    }

    if (json?.mailbox) {
      setMailbox(json.mailbox);
      setMailboxLocalPart(json.mailbox.localPart ?? "");
    }
    setMailboxNote("Business email updated.");
  }

  async function saveTwilio() {
    if (!canEditTwilio) {
      setTwilioError("Forbidden");
      return;
    }
    setSavingTwilio(true);
    setTwilioError(null);
    setTwilioNote(null);

    const payload: any = {};
    if (twilioAccountSid.trim()) payload.accountSid = twilioAccountSid.trim();
    if (twilioAuthToken.trim()) payload.authToken = twilioAuthToken.trim();
    if (twilioFromNumber.trim()) payload.fromNumberE164 = twilioFromNumber.trim();

    const res = await fetch("/api/portal/integrations/twilio", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => null)) as TwilioApiPayload | null;
    if (!res.ok || !data?.ok) {
      setSavingTwilio(false);
      setTwilioError(data?.error || "Failed to save Twilio.");
      return;
    }

    setTwilioMasked(data.twilio);
    setTwilioAccountSid("");
    setTwilioAuthToken("");
    setTwilioFromNumber(data.twilio.fromNumberE164 ?? twilioFromNumber);
    setSavingTwilio(false);
    setTwilioNote(data.note || "Saved Twilio.");
    window.setTimeout(() => setTwilioNote(null), 2000);
  }

  async function clearTwilio() {
    if (!canEditTwilio) {
      setTwilioError("Forbidden");
      return;
    }
    setSavingTwilio(true);
    setTwilioError(null);
    setTwilioNote(null);

    const res = await fetch("/api/portal/integrations/twilio", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });

    const data = (await res.json().catch(() => null)) as TwilioApiPayload | null;
    if (!res.ok || !data?.ok) {
      setSavingTwilio(false);
      setTwilioError(data?.error || "Failed to clear Twilio.");
      return;
    }

    setTwilioMasked(data.twilio);
    setTwilioAccountSid("");
    setTwilioAuthToken("");
    setTwilioFromNumber("");
    setSavingTwilio(false);
    setTwilioNote(data.note || "Cleared Twilio.");
    window.setTimeout(() => setTwilioNote(null), 2000);
  }

  async function saveContact() {
    if (!canSaveContact || !me?.user) return;
    setSavingContact(true);
    setError(null);
    setNotice(null);

    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextPhoneRaw = phone.trim();
    const nextVoiceAgentId = voiceAgentId.trim();
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
    const curVoiceAgentId = (me.user.voiceAgentId ?? "").trim();
    const wantsVoiceAgentApiKeyChange = Boolean(voiceAgentApiKey.trim());

    const wantsNameChange = nextName !== curName;
    const wantsEmailChange = nextEmail !== curEmail;
    const wantsPhoneChange = nextPhone !== curPhone;
    const wantsVoiceAgentIdChange = nextVoiceAgentId !== curVoiceAgentId;

    const payload: Record<string, unknown> = {};
    if (wantsNameChange) payload.name = nextName;
    if (wantsEmailChange) payload.email = nextEmail;
    if (wantsPhoneChange) payload.phone = nextPhone;
    if (wantsVoiceAgentIdChange) payload.voiceAgentId = nextVoiceAgentId;
    if (wantsVoiceAgentApiKeyChange) payload.voiceAgentApiKey = voiceAgentApiKey.trim();
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
      user?: {
        name?: string;
        email?: string;
        phone?: string | null;
        voiceAgentId?: string | null;
        voiceAgentApiKeyConfigured?: boolean;
        role?: string;
      } | null;
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
        voiceAgentId: json.user?.voiceAgentId ?? nextVoiceAgentId,
        voiceAgentApiKeyConfigured: Boolean(
          json.user?.voiceAgentApiKeyConfigured ?? (wantsVoiceAgentApiKeyChange ? true : me.user.voiceAgentApiKeyConfigured),
        ),
        role: json.user?.role ?? me.user.role,
      },
    });
    setCurrentPassword("");
    setVoiceAgentApiKey("");
    setPhone(formatPhoneForDisplay(json.user?.phone ?? nextPhone));
    setNotice(json.note ?? "Saved. You may need to sign out/in to refresh your session.");
  }

  async function clearVoiceAgentApiKey() {
    if (!me?.user) return;
    setSavingContact(true);
    setError(null);
    setNotice(null);

    const res = await fetch("/api/portal/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ voiceAgentApiKey: "" }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      note?: string;
      user?: { voiceAgentApiKeyConfigured?: boolean } | null;
    };
    setSavingContact(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to clear API key");
      return;
    }

    setVoiceAgentApiKey("");
    setVoiceAgentApiKeyConfigured(Boolean(json.user?.voiceAgentApiKeyConfigured));
    setMe({
      ok: true,
      user: {
        ...me.user,
        voiceAgentApiKeyConfigured: Boolean(json.user?.voiceAgentApiKeyConfigured),
      },
    });
    setNotice(json.note ?? "Saved.");
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
            <div className="lg:col-span-2">
              <PortalSettingsSection
                title="Contact info"
                description="Name, email, phone, and password."
                accent="blue"
                defaultOpen
              >
                <div className="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Agent ID (optional)</label>
                    <input
                      value={voiceAgentId}
                      onChange={(e) => setVoiceAgentId(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder="agent_…"
                      autoComplete="off"
                    />
                    <div className="mt-2 text-xs text-zinc-500">Used by voice/AI calling services when enabled.</div>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-600">Voice agent API key (optional)</label>
                      <div className="text-xs text-zinc-500">{voiceAgentApiKeyConfigured ? "configured" : "not set"}</div>
                    </div>
                    <input
                      value={voiceAgentApiKey}
                      onChange={(e) => setVoiceAgentApiKey(e.target.value)}
                      type="password"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder={voiceAgentApiKeyConfigured ? "(leave blank to keep)" : "(paste key)"}
                      autoComplete="off"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-xs text-zinc-500">
                        Used by AI Outbound Calls when enabled.
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                        disabled={savingContact || !voiceAgentApiKeyConfigured}
                        onClick={() => void clearVoiceAgentApiKey()}
                      >
                        Clear key
                      </button>
                    </div>
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

                {notice ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>
                ) : null}

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
                    <div className="text-xs text-zinc-500 sm:self-center">After updating, sign out/in on other devices.</div>
                  </div>
                </div>
              </PortalSettingsSection>
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

          {canViewWebhooks ? (
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
          ) : null}

          {canViewTwilio ? (
            <PortalSettingsSection
              title="Twilio"
              description="Account SID, Auth Token, and From number. Used across SMS + calling services."
              accent="blue"
            >
              <div className="space-y-3">
                {twilioNote ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{twilioNote}</div>
                ) : null}

                {!canEditTwilio ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                    You have view-only access.
                  </div>
                ) : null}

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
                  <div>
                    Configured: <span className="font-semibold text-zinc-900">{twilioMasked?.configured ? "Yes" : "No"}</span>
                  </div>
                  <div className="mt-1">
                    Account: <span className="font-mono">{twilioMasked?.accountSidMasked ?? "N/A"}</span>
                  </div>
                  <div className="mt-1">
                    From: <span className="font-mono">{twilioMasked?.fromNumberE164 ?? "N/A"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-700">Account SID</label>
                    <input
                      value={twilioAccountSid}
                      onChange={(e) => setTwilioAccountSid(e.target.value)}
                      placeholder={twilioMasked?.accountSidMasked ? `Current: ${twilioMasked.accountSidMasked}` : "AC…"}
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      disabled={!canEditTwilio}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700">Auth Token</label>
                    <input
                      value={twilioAuthToken}
                      onChange={(e) => setTwilioAuthToken(e.target.value)}
                      type="password"
                      placeholder={twilioMasked?.configured ? "•••••• (leave blank to keep)" : ""}
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      disabled={!canEditTwilio}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700">From number</label>
                    <input
                      value={twilioFromNumber}
                      onChange={(e) => setTwilioFromNumber(e.target.value)}
                      placeholder={twilioMasked?.fromNumberE164 ?? "+1…"}
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      disabled={!canEditTwilio}
                    />
                  </div>
                </div>

                {canEditTwilio ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void saveTwilio()}
                      disabled={savingTwilio}
                      className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    >
                      {savingTwilio ? "Saving…" : "Save Twilio"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void clearTwilio()}
                      disabled={savingTwilio}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>
            </PortalSettingsSection>
          ) : null}

          {portalMe?.ok === true ? (
            <PortalSettingsSection
              title="Business email"
              description="Your managed @purelyautomation.com email address (used for inbox sending + receiving)."
              accent="pink"
            >
              <div className="space-y-3">
                {mailboxNote ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{mailboxNote}</div>
                ) : null}

                {mailboxError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{mailboxError}</div>
                ) : null}

                {mailboxLoading ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">Loading…</div>
                ) : null}

                {mailbox ? (
                  <CopyRow label="Business email" value={mailbox.emailAddress} />
                ) : mailboxLoading ? null : (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">Business email unavailable.</div>
                )}

                {mailbox ? (
                  mailbox.canChange ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="text-sm font-semibold text-zinc-900">Change email name (one time)</div>
                      <div className="mt-1 text-sm text-zinc-600">
                        Pick the part before <span className="font-mono">@purelyautomation.com</span>. We’ll normalize spaces/symbols.
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                          <label className="text-xs font-semibold text-zinc-600">Email name</label>
                          <input
                            value={mailboxLocalPart}
                            onChange={(e) => setMailboxLocalPart(e.target.value)}
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-zinc-300"
                            placeholder="your-business"
                            autoComplete="off"
                          />
                        </div>
                        <div className="sm:col-span-1 sm:flex sm:items-end">
                          <button
                            type="button"
                            onClick={() => void saveMailboxOnce()}
                            disabled={!canSaveMailbox || mailboxSaving}
                            className="w-full rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                          >
                            {mailboxSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-zinc-500">After saving, this will be locked.</div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                      {portalMe.role !== "OWNER"
                        ? "Only the account owner can change this."
                        : "This business email is locked (one-time change already used)."}
                    </div>
                  )
                ) : null}
              </div>
            </PortalSettingsSection>
          ) : null}

          {canViewBusinessInfo ? (
            <PortalSettingsSection
              title="Business info"
              description="Update your business details and branding anytime."
              accent="pink"
            >
              <BusinessProfileForm
                embedded
                readOnly={!canEditBusinessInfo}
                onSaved={() => setNotice("Business info saved.")}
              />
            </PortalSettingsSection>
          ) : null}
        </div>
      )}
    </div>
  );
}
