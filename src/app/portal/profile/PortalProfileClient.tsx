"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { AppModal } from "@/components/AppModal";

import { BusinessProfileForm } from "./BusinessProfileForm";
import { formatPhoneForDisplay, normalizePhoneStrict } from "@/lib/phone";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import {
  SALES_REPORTING_PROVIDER_OPTIONS,
  providerLabel,
  type SalesReportingProviderKey,
} from "@/lib/salesReportingProviders";
import { SuggestedSetupSection } from "./SuggestedSetupSection";

type Me = {
  ok?: boolean;
  error?: string;
  user: {
    email: string;
    name: string;
    role: string;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
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
  webhooks?: {
    smsInboundUrl: string;
    smsStatusCallbackUrl: string;
  };
  note?: string;
  error?: string;
};

type SalesIntegrationPayload =
  | {
      ok: true;
      encryptionConfigured: boolean;
      activeProvider: SalesReportingProviderKey | null;
      providers: Record<
        SalesReportingProviderKey,
        { configured: boolean; displayHint?: string | null; connectedAtIso?: string | null }
      >;
      stripe: {
        configured: boolean;
        prefix: string | null;
        accountId: string | null;
        connectedAtIso: string | null;
      };
      note?: string;
    }
  | { ok: false; error?: string };

type WebhooksRes = {
  ok?: boolean;
  error?: string;
  baseUrl?: string;
  twilio?: {
    smsInboundUrl?: string | null;
    smsStatusCallbackUrl?: string | null;
  };
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

export function PortalProfileClient({ embedded }: { embedded?: boolean } = {}) {
  const toast = useToast();
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const portalBase = pathname.startsWith("/credit") ? "/credit" : "/portal";
  const fromOnboarding = (searchParams?.get("from") || "").trim().toLowerCase() === "onboarding";
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
  // Twilio webhooks are auto-provisioned on connect; UI does not display URLs.
  const [twilioAccountSid, setTwilioAccountSid] = useState<string>("");
  const [twilioAuthToken, setTwilioAuthToken] = useState<string>("");
  const [twilioFromNumber, setTwilioFromNumber] = useState<string>("");
  const [savingTwilio, setSavingTwilio] = useState(false);
  const [twilioError, setTwilioError] = useState<string | null>(null);
  const [twilioNote, setTwilioNote] = useState<string | null>(null);

  const [salesStatus, setSalesStatus] = useState<SalesIntegrationPayload | null>(null);
  const [salesStatusLoaded, setSalesStatusLoaded] = useState(false);
  const [salesProvider, setSalesProvider] = useState<SalesReportingProviderKey>("stripe");
  const [stripeSecretKey, setStripeSecretKey] = useState<string>("");
  const [stripeSaving, setStripeSaving] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeNote, setStripeNote] = useState<string | null>(null);

  const [authNetLoginId, setAuthNetLoginId] = useState("");
  const [authNetTxKey, setAuthNetTxKey] = useState("");
  const [authNetEnv, setAuthNetEnv] = useState<"production" | "sandbox">("production");

  const [braintreeMerchantId, setBraintreeMerchantId] = useState("");
  const [braintreePublicKey, setBraintreePublicKey] = useState("");
  const [braintreePrivateKey, setBraintreePrivateKey] = useState("");
  const [braintreeEnv, setBraintreeEnv] = useState<"production" | "sandbox">("production");

  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");

  const [paystackSecretKey, setPaystackSecretKey] = useState("");
  const [flutterwaveSecretKey, setFlutterwaveSecretKey] = useState("");
  const [mollieApiKey, setMollieApiKey] = useState("");
  const [mercadoPagoAccessToken, setMercadoPagoAccessToken] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const [contactPasswordModalOpen, setContactPasswordModalOpen] = useState(false);
  const [contactPasswordDraft, setContactPasswordDraft] = useState("");

  const phoneValidation = useMemo(() => {
    const res = normalizePhoneStrict(phone);
    return res;
  }, [phone]);

  const canViewWebhooks = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.webhooks?.view) : false;
  const canViewTwilio = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.twilio?.view) : false;
  const canEditTwilio = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.twilio?.edit) : false;
  const canEditProfile = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.profile?.edit) : false;
  const canViewBusinessInfo = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.businessProfile?.view) : false;
  const canEditBusinessInfo = portalMe?.ok === true ? Boolean((portalMe.permissions as any)?.businessProfile?.edit) : false;

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (twilioError) toast.error(twilioError);
  }, [twilioError, toast]);

  useEffect(() => {
    if (stripeError) toast.error(stripeError);
  }, [stripeError, toast]);

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

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  type AdvancedScrollTarget =
    | "advanced"
    | "webhooks"
    | "twilio"
    | "salesReporting"
    | "businessEmail"
    | "businessInfo";
  const [pendingAdvancedScrollTarget, setPendingAdvancedScrollTarget] = useState<AdvancedScrollTarget | null>(null);

  const advancedRef = useRef<HTMLDivElement | null>(null);
  const webhooksRef = useRef<HTMLDivElement | null>(null);
  const twilioRef = useRef<HTMLDivElement | null>(null);
  const salesReportingRef = useRef<HTMLDivElement | null>(null);
  const businessEmailRef = useRef<HTMLDivElement | null>(null);
  const businessInfoRef = useRef<HTMLDivElement | null>(null);

  const ADVANCED_SCROLL_OFFSET_PX = 96;

  function requestAdvancedScroll(target: AdvancedScrollTarget) {
    setAdvancedOpen(true);
    setPendingAdvancedScrollTarget(target);
  }

  useEffect(() => {
    if (!pendingAdvancedScrollTarget) return;

    // Advanced sections are only mounted when `advancedOpen` is true.
    if (pendingAdvancedScrollTarget !== "advanced" && !advancedOpen) return;

    const el =
      pendingAdvancedScrollTarget === "advanced"
        ? advancedRef.current
        : pendingAdvancedScrollTarget === "webhooks"
          ? webhooksRef.current
          : pendingAdvancedScrollTarget === "twilio"
            ? twilioRef.current
            : pendingAdvancedScrollTarget === "salesReporting"
              ? salesReportingRef.current
              : pendingAdvancedScrollTarget === "businessEmail"
                ? businessEmailRef.current
                : pendingAdvancedScrollTarget === "businessInfo"
                  ? businessInfoRef.current
                  : null;

    if (!el) return;

    function findScrollParent(node: HTMLElement): HTMLElement | null {
      let parent: HTMLElement | null = node.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        const overflowY = style.overflowY;
        const canScrollY =
          (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
          parent.scrollHeight > parent.clientHeight + 1;
        if (canScrollY) return parent;
        parent = parent.parentElement;
      }
      return null;
    }

    function scrollToTarget(node: HTMLElement) {
      const scrollParent = findScrollParent(node);
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const rect = node.getBoundingClientRect();
        const top = scrollParent.scrollTop + (rect.top - parentRect.top) - ADVANCED_SCROLL_OFFSET_PX;
        scrollParent.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        return;
      }

      const top = window.scrollY + node.getBoundingClientRect().top - ADVANCED_SCROLL_OFFSET_PX;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }

    let raf1 = 0;
    let raf2 = 0;
    let t = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        // Give layout a beat to settle after expanding advanced.
        t = window.setTimeout(() => {
          scrollToTarget(el);
          setPendingAdvancedScrollTarget(null);
        }, 50);
      });
    });

    return () => {
      if (t) window.clearTimeout(t);
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [advancedOpen, pendingAdvancedScrollTarget]);

  const canSaveContact = useMemo(() => {
    if (!me) return false;
    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextPhoneRaw = phone.trim();
    const nextCity = city.trim();
    const nextState = state.trim();

    const curName = me.user?.name ?? "";
    const curEmail = (me.user?.email ?? "").toLowerCase();
    const curPhone = (me.user?.phone ?? "").trim();
    const curCity = (me.user?.city ?? "").trim();
    const curState = (me.user?.state ?? "").trim();

    const nextPhoneE164 = (() => {
      if (!nextPhoneRaw) return null;
      const res = normalizePhoneStrict(nextPhoneRaw);
      if (!res.ok) return null;
      return res.e164 ?? null;
    })();

    const wantsNameChange = nextName !== curName;
    const wantsEmailChange = nextEmail !== curEmail;
    const wantsPhoneChange = nextPhoneRaw ? nextPhoneE164 !== curPhone : Boolean(curPhone);
    const wantsCityChange = nextCity !== curCity;
    const wantsStateChange = nextState !== curState;

    if (
      !wantsNameChange &&
      !wantsEmailChange &&
      !wantsPhoneChange &&
      !wantsCityChange &&
      !wantsStateChange
    ) {
      return false;
    }

    const requiresPhone = wantsNameChange || wantsEmailChange || wantsPhoneChange;
    if (requiresPhone && !nextPhoneE164) return false;

    if (wantsNameChange || wantsEmailChange) {
      return nextName.length >= 2 && nextEmail.length >= 3;
    }

    // No password required for phone updates.
    return true;
  }, [me, name, email, phone, city, state]);

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
        setCity(json.user?.city ?? "");
        setState(json.user?.state ?? "");
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
        if (mounted) {
          setTwilioMasked(null);
        }
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
      const res = await fetch("/api/portal/integrations/sales-reporting", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      setSalesStatusLoaded(true);
      if (!res?.ok) return;
      const json = ((await res.json().catch(() => null)) as SalesIntegrationPayload | null) ?? null;
      if (json?.ok) {
        setSalesStatus(json);
        if (json.activeProvider) setSalesProvider(json.activeProvider);
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

  async function refreshSalesStatus() {
    const res = await fetch("/api/portal/integrations/sales-reporting", { cache: "no-store" }).catch(() => null as any);
    setSalesStatusLoaded(true);
    if (!res?.ok) return;
    const json = ((await res.json().catch(() => null)) as SalesIntegrationPayload | null) ?? null;
    if (json?.ok) setSalesStatus(json);
  }

  async function setActiveProvider(next: SalesReportingProviderKey | null) {
    if (!canEditProfile) {
      setStripeError("You have view-only access.");
      return;
    }

    setStripeSaving(true);
    setStripeError(null);
    setStripeNote(null);

    const res = await fetch("/api/portal/integrations/sales-reporting", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "setActive", provider: next }),
    }).catch(() => null as any);

    const json = (res ? ((await res.json().catch(() => null)) as any) : null) as { ok?: boolean; error?: string } | null;
    setStripeSaving(false);

    if (!res?.ok || !json?.ok) {
      setStripeError(json?.error ?? "Unable to update");
      return;
    }

    await refreshSalesStatus();
  }

  async function connectSelectedProvider() {
    if (!canEditProfile) {
      setStripeError("You have view-only access.");
      return;
    }

    setStripeSaving(true);
    setStripeError(null);
    setStripeNote(null);

    let data: any = null;
    if (salesProvider === "stripe") {
      const key = stripeSecretKey.trim();
      if (!key) {
        setStripeSaving(false);
        setStripeError("Paste your Stripe secret key first.");
        return;
      }
      data = { provider: "stripe", secretKey: key };
    } else if (salesProvider === "authorizenet") {
      data = { provider: "authorizenet", apiLoginId: authNetLoginId.trim(), transactionKey: authNetTxKey.trim(), environment: authNetEnv };
    } else if (salesProvider === "braintree") {
      data = { provider: "braintree", merchantId: braintreeMerchantId.trim(), publicKey: braintreePublicKey.trim(), privateKey: braintreePrivateKey.trim(), environment: braintreeEnv };
    } else if (salesProvider === "razorpay") {
      data = { provider: "razorpay", keyId: razorpayKeyId.trim(), keySecret: razorpayKeySecret.trim() };
    } else if (salesProvider === "paystack") {
      data = { provider: "paystack", secretKey: paystackSecretKey.trim() };
    } else if (salesProvider === "flutterwave") {
      data = { provider: "flutterwave", secretKey: flutterwaveSecretKey.trim() };
    } else if (salesProvider === "mollie") {
      data = { provider: "mollie", apiKey: mollieApiKey.trim() };
    } else if (salesProvider === "mercadopago") {
      data = { provider: "mercadopago", accessToken: mercadoPagoAccessToken.trim() };
    }

    const res = await fetch("/api/portal/integrations/sales-reporting", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "connect", data }),
    }).catch(() => null as any);

    const json = (res ? ((await res.json().catch(() => null)) as any) : null) as { ok?: boolean; error?: string; note?: string } | null;
    setStripeSaving(false);

    if (!res?.ok || !json?.ok) {
      setStripeError(json?.error ?? "Unable to connect");
      return;
    }

    setStripeNote(json?.note ?? "Connected.");
    setStripeSecretKey("");
    setAuthNetLoginId("");
    setAuthNetTxKey("");
    setBraintreeMerchantId("");
    setBraintreePublicKey("");
    setBraintreePrivateKey("");
    setRazorpayKeyId("");
    setRazorpayKeySecret("");
    setPaystackSecretKey("");
    setFlutterwaveSecretKey("");
    setMollieApiKey("");
    setMercadoPagoAccessToken("");

    await refreshSalesStatus();
  }

  async function disconnectSelectedProvider() {
    if (!canEditProfile) {
      setStripeError("You have view-only access.");
      return;
    }

    setStripeSaving(true);
    setStripeError(null);
    setStripeNote(null);

    const res = await fetch("/api/portal/integrations/sales-reporting", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: salesProvider }),
    }).catch(() => null as any);

    const json = (res ? ((await res.json().catch(() => null)) as any) : null) as { ok?: boolean; error?: string; note?: string } | null;
    setStripeSaving(false);

    if (!res?.ok || !json?.ok) {
      setStripeError(json?.error ?? "Unable to disconnect");
      return;
    }

    setStripeNote(json?.note ?? "Disconnected.");
    setStripeSecretKey("");
    await refreshSalesStatus();
  }

  // Stripe connect/disconnect is handled via connectSelectedProvider/disconnectSelectedProvider.

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

  async function doSaveContact({ passwordOverride }: { passwordOverride?: string | null } = {}) {
    if (!canSaveContact || !me?.user) return;
    setSavingContact(true);
    setError(null);
    setNotice(null);

    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextPhoneRaw = phone.trim();
    const nextCity = city.trim();
    const nextState = state.trim();

    const curName = me.user.name ?? "";
    const curEmail = (me.user.email ?? "").toLowerCase();
    const curPhone = (me.user.phone ?? "").trim();
    const curCity = (me.user.city ?? "").trim();
    const curState = (me.user.state ?? "").trim();

    const wantsNameChange = nextName !== curName;
    const wantsEmailChange = nextEmail !== curEmail;
    const nextPhoneE164 = (() => {
      if (!nextPhoneRaw) return null;
      const res = normalizePhoneStrict(nextPhoneRaw);
      if (!res.ok) {
        setSavingContact(false);
        setError(res.error);
        return null;
      }
      return res.e164 ?? null;
    })();
    const wantsPhoneChange = nextPhoneRaw ? nextPhoneE164 !== curPhone : Boolean(curPhone);
    const wantsCityChange = nextCity !== curCity;
    const wantsStateChange = nextState !== curState;

    const needsPassword = wantsNameChange || wantsEmailChange;
    const effectivePassword = typeof passwordOverride === "string" ? passwordOverride : currentPassword;
    if (needsPassword && effectivePassword.trim().length < 6) {
      setSavingContact(false);
      setContactPasswordDraft("");
      setContactPasswordModalOpen(true);
      return;
    }

    const requiresPhone = wantsNameChange || wantsEmailChange || wantsPhoneChange;
    if (requiresPhone && !nextPhoneE164) {
      setSavingContact(false);
      setError("Phone is required.");
      return;
    }

    const nextPhone = nextPhoneE164 ?? curPhone;

    const payload: Record<string, unknown> = {};
    if (wantsNameChange) payload.name = nextName;
    if (wantsEmailChange) payload.email = nextEmail;
    if (wantsPhoneChange) payload.phone = nextPhone;
    if (needsPassword) payload.currentPassword = effectivePassword;
    if (wantsCityChange) payload.city = nextCity;
    if (wantsStateChange) payload.state = nextState;

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
        city?: string | null;
        state?: string | null;
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
        city: json.user?.city ?? (wantsCityChange ? nextCity : me.user.city) ?? null,
        state: json.user?.state ?? (wantsStateChange ? nextState : me.user.state) ?? null,
        role: json.user?.role ?? me.user.role,
      },
    });
    setCurrentPassword("");
    setContactPasswordDraft("");
    setContactPasswordModalOpen(false);
    setPhone(formatPhoneForDisplay(json.user?.phone ?? nextPhone));
    if (wantsCityChange) setCity(json.user?.city ?? nextCity);
    if (wantsStateChange) setState(json.user?.state ?? nextState);
    setNotice(json.note ?? "Saved. You may need to sign out/in to refresh your session.");
  }

  async function saveContact() {
    await doSaveContact();
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
    setPasswordModalOpen(false);
    setNotice(json.note ?? "Password updated.");
  }

  const sectionVariant: "card" | "plain" = embedded ? "plain" : "card";

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-6xl"}>
      {!embedded && fromOnboarding ? (
        <div>
          <Link
            href={`${portalBase}/app/onboarding`}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            ← Back to onboarding
          </Link>
        </div>
      ) : null}
      {!embedded ? (
        <>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Profile</h1>
          <p className="mt-2 text-sm text-zinc-600">Account details and security.</p>
        </>
      ) : null}

      {loading ? (
        <div
          className={
            embedded
              ? "mt-6 text-sm text-zinc-600"
              : "mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600"
          }
        >
          Loading…
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <SuggestedSetupSection canEdit={canEditBusinessInfo} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PortalSettingsSection
                title="Contact info"
                description="Name, email, phone, and location."
                accent="blue"
                collapsible={false}
                dotClassName="hidden"
                variant={sectionVariant}
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
                    <label className="text-xs font-semibold text-zinc-600">Phone</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={() => setPhone(formatPhoneForDisplay(phone))}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">City</label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder="Dallas"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">State</label>
                    <input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder="TX"
                    />
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
                    {savingContact ? "Saving…" : canSaveContact ? "Save changes" : "Saved"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    onClick={() => setPasswordModalOpen(true)}
                    disabled={!canEditProfile}
                  >
                    Change password
                  </button>
                </div>
              </PortalSettingsSection>
            </div>
          </div>

          <div
            ref={advancedRef}
            className={embedded ? "scroll-mt-24" : "scroll-mt-24 rounded-3xl border border-zinc-200 bg-white p-6"}
          >
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="inline-flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 sm:w-auto"
            >
              <span>Advanced</span>
              <span
                className={
                  "ml-3 inline-block text-sm leading-none transition-transform " +
                  (advancedOpen ? "rotate-180" : "rotate-0")
                }
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
          </div>

          {advancedOpen ? (
            <div className="space-y-4">

              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {canViewTwilio ? (
                  <button
                    type="button"
                    onClick={() => requestAdvancedScroll("twilio")}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                  >
                    Twilio
                  </button>
                ) : null}
                {canViewWebhooks ? (
                  <button
                    type="button"
                    onClick={() => requestAdvancedScroll("webhooks")}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                  >
                    Webhooks
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => requestAdvancedScroll("salesReporting")}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                >
                  Sales reporting
                </button>
                {portalMe?.ok === true ? (
                  <button
                    type="button"
                    onClick={() => requestAdvancedScroll("businessEmail")}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                  >
                    Business email
                  </button>
                ) : null}
                {canViewBusinessInfo ? (
                  <button
                    type="button"
                    onClick={() => requestAdvancedScroll("businessInfo")}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                  >
                    Business info
                  </button>
                ) : null}
              </div>
              
              {canViewWebhooks ? (
                <div ref={webhooksRef} className="scroll-mt-24">
                  <PortalSettingsSection
                    title="Webhooks (copy/paste)"
                    description="Paste these into Twilio so calls flow into your AI Receptionist and Missed-Call Text Back."
                    accent="blue"
                    collapsible={false}
                    dotClassName="hidden"
                    variant={sectionVariant}
                  >
                    <div className="space-y-3">
                      <CopyRow label="Calls (Primary handler: AI Receptionist)" value={webhooks?.legacy?.aiReceptionistVoiceUrl ?? null} />
                      <CopyRow label="Calls (If primary handler fails: Missed Call Text Back)" value={webhooks?.legacy?.missedCallVoiceUrl ?? null} />

                      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                        <div className="font-semibold text-zinc-900">Where do I paste these in Twilio?</div>
                        <div className="mt-2 space-y-1">
                          <div>1) Twilio Console → Phone Numbers → Manage → Active numbers → click your number</div>
                          <div>2) For calls: Voice &amp; Fax → A CALL COMES IN → paste <span className="font-semibold">Calls (Primary handler: AI Receptionist)</span></div>
                          <div>3) Still in Voice &amp; Fax → IF PRIMARY HANDLER FAILS → paste <span className="font-semibold">Calls (If primary handler fails: Missed Call Text Back)</span></div>
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">SMS webhooks are configured automatically when you connect Twilio.</div>
                      </div>

                      {webhooks?.baseUrl ? (
                        <div className="text-xs text-zinc-500">
                          Webhook base: <span className="font-mono">{webhooks.baseUrl}</span>
                        </div>
                      ) : null}
                    </div>
                  </PortalSettingsSection>
                </div>
              ) : null}

              {canViewTwilio ? (
                <div ref={twilioRef} className="scroll-mt-24">
                  <PortalSettingsSection
                    title="Twilio"
                    description="Paste your Twilio Account SID, Auth Token, and From number. This powers Inbox (SMS) + AI Receptionist + Missed-Call Text Back."
                    accent="blue"
                    collapsible={false}
                    dotClassName="hidden"
                    variant={sectionVariant}
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

                      <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                        <div className="font-semibold text-zinc-900">Where do I find these?</div>
                        <div className="mt-2 space-y-1">
                          <div>• Account SID + Auth Token: Twilio Console → Account → <span className="font-semibold">Account Info</span></div>
                          <div>• From number: Twilio Console → Phone Numbers → <span className="font-semibold">Active numbers</span></div>
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">Tip: paste the number in E.164 format (example: +15551234567).</div>
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
                            className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
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
                </div>
              ) : null}

              <div ref={salesReportingRef} className="scroll-mt-24">
                <PortalSettingsSection
                  title="Sales Reporting"
                  description="Connect your payment processor to unlock a sales dashboard."
                  accent="blue"
                  collapsible={false}
                  dotClassName="hidden"
                  variant={sectionVariant}
                >
                  <div className="space-y-3">
                    {stripeNote ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{stripeNote}</div>
                    ) : null}

              {stripeError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{stripeError}</div>
              ) : null}

              {salesStatusLoaded && salesStatus?.ok === true && !salesStatus.encryptionConfigured ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Sales reporting setup is temporarily unavailable. Please contact support.
                </div>
              ) : null}

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">Connect a payment processor</div>
                <div className="mt-1">Whichever one you connect becomes the active provider for your Sales dashboard and widget.</div>
              </div>

              {salesStatusLoaded && salesStatus?.ok === true ? (
                (() => {
                  const connectedOptions = SALES_REPORTING_PROVIDER_OPTIONS.filter((o) => salesStatus.providers[o.value]?.configured);
                  if (connectedOptions.length === 0) return null;
                  const active = salesStatus.activeProvider ?? connectedOptions[0].value;
                  return (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="text-xs font-semibold text-zinc-600">Active provider</div>
                      <div className="mt-2">
                        <PortalListboxDropdown
                          value={active}
                          options={connectedOptions}
                          onChange={(v) => void setActiveProvider(v)}
                          disabled={!canEditProfile || stripeSaving}
                          portal={false}
                        />
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">Your Sales dashboard uses the active provider.</div>
                    </div>
                  );
                })()
              ) : null}

              {!canEditProfile ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">You have view-only access.</div>
              ) : null}

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold text-zinc-600">Provider</div>
                <div className="mt-2">
                  <PortalListboxDropdown
                    value={salesProvider}
                    options={SALES_REPORTING_PROVIDER_OPTIONS}
                    onChange={(v) => setSalesProvider(v)}
                    disabled={stripeSaving}
                    portal={false}
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
                  <div>
                    Connected:{" "}
                    <span className="font-semibold text-zinc-900">
                      {salesStatus?.ok === true && salesStatus.providers[salesProvider]?.configured ? "Yes" : "No"}
                    </span>
                  </div>
                  {salesProvider === "stripe" ? (
                    <>
                      <div className="mt-1">
                        Key type: <span className="font-mono">{salesStatus?.ok === true ? salesStatus.stripe.prefix ?? "N/A" : "N/A"}</span>
                      </div>
                      <div className="mt-1">
                        Account: <span className="font-mono">{salesStatus?.ok === true ? salesStatus.stripe.accountId ?? "N/A" : "N/A"}</span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-1">
                      Details:{" "}
                      <span className="font-mono">
                        {salesStatus?.ok === true ? salesStatus.providers[salesProvider]?.displayHint ?? "N/A" : "N/A"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {salesProvider === "stripe" ? (
                    <div>
                      <label className="text-xs font-semibold text-zinc-700">Stripe secret key</label>
                      <input
                        value={stripeSecretKey}
                        onChange={(e) => setStripeSecretKey(e.target.value)}
                        type="password"
                        placeholder={salesStatus?.ok === true && salesStatus.providers.stripe?.configured ? "•••••• (paste to replace)" : "sk_live_… or rk_live_…"}
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                        autoComplete="off"
                      />
                      <div className="mt-2 text-xs text-zinc-500">
                        Find it in Stripe: <span className="font-semibold">Dashboard → Developers → API keys</span> → copy your Secret key.
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">We store it encrypted and never show the full key back to you.</div>
                    </div>
                  ) : null}

                  {salesProvider === "authorizenet" ? (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">API Login ID</label>
                        <input
                          value={authNetLoginId}
                          onChange={(e) => setAuthNetLoginId(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">Transaction Key</label>
                        <input
                          value={authNetTxKey}
                          onChange={(e) => setAuthNetTxKey(e.target.value)}
                          type="password"
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">Environment</label>
                        <select
                          value={authNetEnv}
                          onChange={(e) => setAuthNetEnv(e.target.value as any)}
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving}
                        >
                          <option value="production">Production</option>
                          <option value="sandbox">Sandbox</option>
                        </select>
                      </div>

                      <div className="text-xs text-zinc-500">
                        Find these in Authorize.Net: <span className="font-semibold">Account → Settings → Security Settings → API Credentials &amp; Keys</span>.
                      </div>
                      <div className="text-xs text-zinc-500">Use Sandbox keys for Sandbox; use Production keys for Production.</div>
                    </>
                  ) : null}

                  {salesProvider === "braintree" ? (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">Merchant ID</label>
                        <input
                          value={braintreeMerchantId}
                          onChange={(e) => setBraintreeMerchantId(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">Public Key</label>
                        <input
                          value={braintreePublicKey}
                          onChange={(e) => setBraintreePublicKey(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">Private Key</label>
                        <input
                          value={braintreePrivateKey}
                          onChange={(e) => setBraintreePrivateKey(e.target.value)}
                          type="password"
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">Environment</label>
                        <select
                          value={braintreeEnv}
                          onChange={(e) => setBraintreeEnv(e.target.value as any)}
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving}
                        >
                          <option value="production">Production</option>
                          <option value="sandbox">Sandbox</option>
                        </select>
                      </div>

                      <div className="text-xs text-zinc-500">
                        Find these in Braintree: <span className="font-semibold">Control Panel → Settings → API</span> (API Keys).
                      </div>
                      <div className="text-xs text-zinc-500">Use Sandbox keys for Sandbox; use Production keys for Production.</div>
                    </>
                  ) : null}

                  {salesProvider === "razorpay" ? (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">Key ID</label>
                        <input
                          value={razorpayKeyId}
                          onChange={(e) => setRazorpayKeyId(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-700">Key Secret</label>
                        <input
                          value={razorpayKeySecret}
                          onChange={(e) => setRazorpayKeySecret(e.target.value)}
                          type="password"
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                          autoComplete="off"
                        />
                      </div>

                      <div className="text-xs text-zinc-500">
                        Find these in Razorpay: <span className="font-semibold">Dashboard → Settings → API Keys</span>.
                      </div>
                    </>
                  ) : null}

                  {salesProvider === "paystack" ? (
                    <div>
                      <label className="text-xs font-semibold text-zinc-700">Secret key</label>
                      <input
                        value={paystackSecretKey}
                        onChange={(e) => setPaystackSecretKey(e.target.value)}
                        type="password"
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                        autoComplete="off"
                      />

                      <div className="mt-2 text-xs text-zinc-500">
                        Find it in Paystack: <span className="font-semibold">Settings → API Keys &amp; Webhooks</span>.
                      </div>
                    </div>
                  ) : null}

                  {salesProvider === "flutterwave" ? (
                    <div>
                      <label className="text-xs font-semibold text-zinc-700">Secret key</label>
                      <input
                        value={flutterwaveSecretKey}
                        onChange={(e) => setFlutterwaveSecretKey(e.target.value)}
                        type="password"
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                        autoComplete="off"
                      />

                      <div className="mt-2 text-xs text-zinc-500">
                        Find it in Flutterwave: <span className="font-semibold">Dashboard → Settings → API</span>.
                      </div>
                    </div>
                  ) : null}

                  {salesProvider === "mollie" ? (
                    <div>
                      <label className="text-xs font-semibold text-zinc-700">API key</label>
                      <input
                        value={mollieApiKey}
                        onChange={(e) => setMollieApiKey(e.target.value)}
                        type="password"
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                        autoComplete="off"
                      />

                      <div className="mt-2 text-xs text-zinc-500">
                        Find it in Mollie: <span className="font-semibold">Dashboard → Developers → API keys</span>.
                      </div>
                    </div>
                  ) : null}

                  {salesProvider === "mercadopago" ? (
                    <div>
                      <label className="text-xs font-semibold text-zinc-700">Access token</label>
                      <input
                        value={mercadoPagoAccessToken}
                        onChange={(e) => setMercadoPagoAccessToken(e.target.value)}
                        type="password"
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                        autoComplete="off"
                      />

                      <div className="mt-2 text-xs text-zinc-500">
                        Find it in Mercado Pago: <span className="font-semibold">Developers → Your integrations → Credentials</span> (use the Access Token).
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void connectSelectedProvider()}
                      disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured)}
                      className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    >
                      {stripeSaving
                        ? "Saving…"
                        : salesStatus?.ok === true && salesStatus.providers[salesProvider]?.configured
                          ? `Replace ${providerLabel(salesProvider)}`
                          : `Connect ${providerLabel(salesProvider)}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnectSelectedProvider()}
                      disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.providers[salesProvider]?.configured)}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Disconnect
                    </button>
                  </div>
                  <Link href="/portal/app/services/reporting/sales" className="text-sm font-semibold text-(--color-brand-blue) hover:underline">
                    Open sales dashboard →
                  </Link>
                </div>
              </div>
            </div>
          </PortalSettingsSection>
          </div>

          {portalMe?.ok === true ? (
            <div ref={businessEmailRef} className="scroll-mt-24">
              <PortalSettingsSection
                title="Business email"
                description="Your managed @purelyautomation.com email address (used for inbox sending + receiving)."
                accent="pink"
                collapsible={false}
                dotClassName="hidden"
                variant={sectionVariant}
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
                            {mailboxSaving ? "Saving…" : canSaveMailbox ? "Save" : "Saved"}
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
            </div>
          ) : null}

          {canViewBusinessInfo ? (
            <div ref={businessInfoRef} className="scroll-mt-24">
              <PortalSettingsSection
                title="Business info"
                description="Update your business details and branding anytime."
                accent="pink"
                collapsible={false}
                dotClassName="hidden"
                variant={sectionVariant}
              >
                <BusinessProfileForm
                  embedded
                  readOnly={!canEditBusinessInfo}
                  onSaved={() => setNotice("Business info saved.")}
                />
              </PortalSettingsSection>
            </div>
          ) : null}

            </div>
          ) : null}

          <AppModal
            open={contactPasswordModalOpen}
            title="Confirm contact changes"
            description="Enter your current password to update name or email."
            onClose={() => {
              if (savingContact) return;
              setContactPasswordModalOpen(false);
            }}
            widthClassName="w-[min(640px,calc(100vw-32px))]"
            footer={
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  onClick={() => setContactPasswordModalOpen(false)}
                  disabled={savingContact}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void doSaveContact({ passwordOverride: contactPasswordDraft })}
                  disabled={contactPasswordDraft.trim().length < 6 || savingContact}
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {savingContact ? "Saving…" : "Confirm and save"}
                </button>
              </div>
            }
          >
            <div>
              <label className="text-xs font-semibold text-zinc-700">Current password</label>
              <input
                value={contactPasswordDraft}
                onChange={(e) => setContactPasswordDraft(e.target.value)}
                type="password"
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-zinc-300"
                placeholder="Current password"
              />
              <div className="mt-2 text-xs text-zinc-500">
                This helps prevent someone who is already logged in from changing account details.
              </div>
            </div>
          </AppModal>

          <AppModal
            open={passwordModalOpen}
            title="Change password"
            description="Update your password for this account."
            onClose={() => setPasswordModalOpen(false)}
            closeVariant="x"
            hideHeaderDivider
            widthClassName="w-[min(640px,calc(100vw-32px))]"
            footer={
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <div className="text-xs text-zinc-600 sm:mr-auto">After updating, sign out/in on other devices.</div>
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  onClick={() => setPasswordModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={changePassword}
                  disabled={!canSavePassword || savingPassword}
                  className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {savingPassword ? "Updating…" : "Update password"}
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-zinc-700">Current password</label>
                <input
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  type="password"
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-zinc-300"
                  placeholder="Current password"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700">New password</label>
                <input
                  value={pwNext}
                  onChange={(e) => setPwNext(e.target.value)}
                  type="password"
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-zinc-300"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700">Confirm new password</label>
                <input
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  type="password"
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-zinc-300"
                  placeholder="Repeat new password"
                />
              </div>
            </div>
          </AppModal>

        </div>
      )}
    </div>
  );
}
