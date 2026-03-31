"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { AppModal } from "@/components/AppModal";
import {
  PORTAL_API_KEY_PERMISSION_OPTIONS,
  type PortalApiKeyPermission,
  type PortalApiKeysPayload,
  type PortalApiKeySummary,
} from "@/lib/portalApiKeys.shared";

import { BusinessProfileForm } from "./BusinessProfileForm";
import { formatPhoneForDisplay, normalizePhoneStrict } from "@/lib/phone";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import {
  SALES_REPORTING_PROVIDER_OPTIONS,
  providerLabel,
  type SalesReportingProviderKey,
} from "@/lib/salesReportingProviders";
import { SuggestedSetupSection } from "./SuggestedSetupSection";
import { IconChevron, IconCopy, IconEyeGlyph, IconEyeOffGlyph } from "@/app/portal/PortalIcons";

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

type PortalApiKeysResponse = PortalApiKeysPayload | { ok: false; error?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type FunnelBuilderDomain = {
  id: string;
  domain: string;
  status: string;
  verifiedAt?: string | null;
  rootMode?: string | null;
  rootFunnelSlug?: string | null;
};

function deriveDnsHostLabel(domain: string): string {
  const s = String(domain || "").trim().toLowerCase();
  if (!s) return "@";
  if (s.startsWith("www.")) return "www";

  const parts = s.split(".").filter(Boolean);
  if (parts.length <= 2) return "@";
  return parts.slice(0, -2).join(".") || "@";
}

function isLikelyApexDomain(domain: string): boolean {
  const s = String(domain || "").trim().toLowerCase();
  if (!s) return true;
  if (s.startsWith("www.")) return false;
  const parts = s.split(".").filter(Boolean);
  return parts.length <= 2;
}

function customDomainTargetHost(): string {
  return String(process.env.NEXT_PUBLIC_CUSTOM_DOMAIN_TARGET_HOST || "").trim() || "cname.vercel-dns.com";
}

function CopyRow({ label, value }: { label: string; value: string | null | undefined }) {
  const v = value && value.trim() ? value : null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-xs font-semibold text-zinc-600">{label}</div>
      <div className="mt-2 break-all font-mono text-xs text-zinc-800">{v ?? "N/A"}</div>
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
          disabled={!v}
          onClick={async () => v && navigator.clipboard.writeText(v)}
        >
          <IconCopy size={16} />
          Copy
        </button>
      </div>
    </div>
  );
}

function formatApiKeyTimestamp(value: string | null | undefined) {
  if (!value) return "Never used";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Never used";
  return date.toLocaleString();
}

function ToggleChip({ checked }: { checked: boolean }) {
  return (
    <span
      className={classNames(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150",
        checked ? "bg-brand-blue" : "bg-zinc-300",
      )}
    >
      <span
        className={classNames(
          "inline-block h-5 w-5 rounded-full bg-white transition-transform duration-150",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </span>
  );
}

type PortalProfileClientMode = "all" | "profile" | "integrations" | "business";

export function PortalProfileClient({ embedded, mode = "all" }: { embedded?: boolean; mode?: PortalProfileClientMode } = {}) {
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
  const [funnelDomains, setFunnelDomains] = useState<FunnelBuilderDomain[]>([]);
  const [funnelDomainsLoaded, setFunnelDomainsLoaded] = useState(false);
  const [domainComposerOpen, setDomainComposerOpen] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainVerifyBusy, setDomainVerifyBusy] = useState<Record<string, boolean>>({});
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  const [salesProvider, setSalesProvider] = useState<SalesReportingProviderKey>("stripe");
  const [stripeSecretKey, setStripeSecretKey] = useState<string>("");
  const [stripeSaving, setStripeSaving] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeNote, setStripeNote] = useState<string | null>(null);
  const [twilioExpanded, setTwilioExpanded] = useState(false);
  const [salesReportingExpanded, setSalesReportingExpanded] = useState(false);
  const [apiKeysExpanded, setApiKeysExpanded] = useState(false);
  const [apiKeysState, setApiKeysState] = useState<PortalApiKeysPayload | null>(null);
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);
  const [revealedApiKeyValues, setRevealedApiKeyValues] = useState<Record<string, string>>({});
  const [revealingApiKeyId, setRevealingApiKeyId] = useState<string | null>(null);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [deletingApiKeyId, setDeletingApiKeyId] = useState<string | null>(null);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyPermissions, setNewApiKeyPermissions] = useState<PortalApiKeyPermission[]>(["pura.chat", "people"]);
  const [newApiKeyCreditLimitEnabled, setNewApiKeyCreditLimitEnabled] = useState(false);
  const [newApiKeyCreditLimit, setNewApiKeyCreditLimit] = useState("");

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
    if (apiKeysError) toast.error(apiKeysError);
  }, [apiKeysError, toast]);

  useEffect(() => {
    if (!phoneValidation.ok) toast.error(phoneValidation.error);
  }, [phoneValidation, toast]);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const platformTargetHost = useMemo(() => customDomainTargetHost(), []);

  const showSuggestedSetup = mode === "all" || mode === "profile";
  const showContactSection = mode === "all" || mode === "profile";
  const showIntegrationSections = mode === "all" || mode === "integrations";
  const showBusinessSections = mode === "all" || mode === "business";
  const showAdvancedToggle = mode === "all";

  type AdvancedScrollTarget =
    | "advanced"
    | "domains"
    | "twilio"
    | "salesReporting"
    | "apiKeys"
    | "businessEmail"
    | "businessInfo";
  const [pendingAdvancedScrollTarget, setPendingAdvancedScrollTarget] = useState<AdvancedScrollTarget | null>(null);

  const advancedRef = useRef<HTMLDivElement | null>(null);
  const domainsRef = useRef<HTMLDivElement | null>(null);
  const twilioRef = useRef<HTMLDivElement | null>(null);
  const salesReportingRef = useRef<HTMLDivElement | null>(null);
  const apiKeysRef = useRef<HTMLDivElement | null>(null);
  const businessEmailRef = useRef<HTMLDivElement | null>(null);
  const businessInfoRef = useRef<HTMLDivElement | null>(null);

  const ADVANCED_SCROLL_OFFSET_PX = 96;

  function requestAdvancedScroll(target: AdvancedScrollTarget) {
    if (target === "twilio") setTwilioExpanded(true);
    if (target === "salesReporting") setSalesReportingExpanded(true);
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
        : pendingAdvancedScrollTarget === "domains"
          ? domainsRef.current
          : pendingAdvancedScrollTarget === "twilio"
            ? twilioRef.current
            : pendingAdvancedScrollTarget === "salesReporting"
              ? salesReportingRef.current
              : pendingAdvancedScrollTarget === "apiKeys"
                ? apiKeysRef.current
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

    const loadDomains = async () => {
      const res = await fetch("/api/portal/funnel-builder/domains", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      setFunnelDomainsLoaded(true);
      if (!res?.ok) {
        setFunnelDomains([]);
        return;
      }
      const json = (await res.json().catch(() => null)) as { ok?: boolean; domains?: FunnelBuilderDomain[] } | null;
      setFunnelDomains(json?.ok === true && Array.isArray(json.domains) ? json.domains : []);
    };

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

    void loadDomains();

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

    void loadApiKeys();

    return () => {
      mounted = false;
    };
  }, [portalMe, canViewWebhooks, canViewTwilio]);

  async function reloadDomains() {
    setFunnelDomainsLoaded(false);
    const res = await fetch("/api/portal/funnel-builder/domains", { cache: "no-store" }).catch(() => null as any);
    setFunnelDomainsLoaded(true);
    if (!res?.ok) {
      setFunnelDomains([]);
      return;
    }
    const json = (await res.json().catch(() => null)) as { ok?: boolean; domains?: FunnelBuilderDomain[] } | null;
    setFunnelDomains(json?.ok === true && Array.isArray(json.domains) ? json.domains : []);
  }

  async function copyText(value: string) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Unable to copy");
    }
  }

  async function addDomain() {
    const next = domainInput.trim();
    if (!next || domainBusy) return;
    setDomainBusy(true);
    const res = await fetch("/api/portal/funnel-builder/domains", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: next }),
    }).catch(() => null as any);
    const json = (res ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null) : null) ?? null;
    setDomainBusy(false);
    if (!res?.ok || !json?.ok) {
      toast.error(json?.error || "Unable to add domain");
      return;
    }
    setDomainInput("");
    setDomainComposerOpen(false);
    toast.success("Domain added");
    await reloadDomains();
  }

  async function verifyDomain(domain: FunnelBuilderDomain) {
    if (!domain?.id || domainVerifyBusy[domain.id]) return;
    setDomainVerifyBusy((current) => ({ ...current, [domain.id]: true }));
    const res = await fetch(`/api/portal/funnel-builder/domains/${encodeURIComponent(domain.id)}/verify`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => null as any);
    const json = (res ? ((await res.json().catch(() => null)) as { ok?: boolean; verified?: boolean; error?: string } | null) : null) ?? null;
    setDomainVerifyBusy((current) => ({ ...current, [domain.id]: false }));
    if (!res?.ok || !json?.ok) {
      toast.error(json?.error || "Unable to verify domain");
      return;
    }
    if (json.verified) toast.success(`${domain.domain} is ready.`);
    else if (json.error) toast.error(json.error);
    await reloadDomains();
  }

  async function refreshSalesStatus() {
    const res = await fetch("/api/portal/integrations/sales-reporting", { cache: "no-store" }).catch(() => null as any);
    setSalesStatusLoaded(true);
    if (!res?.ok) return;
    const json = ((await res.json().catch(() => null)) as SalesIntegrationPayload | null) ?? null;
    if (json?.ok) setSalesStatus(json);
  }

  async function loadApiKeys() {
    setApiKeysError(null);
    const res = await fetch("/api/portal/integrations/api-keys", { cache: "no-store" }).catch(() => null as any);
    setApiKeysLoaded(true);
    if (!res?.ok) {
      const json = ((await res?.json().catch(() => null)) as PortalApiKeysResponse | null) ?? null;
      setApiKeysState(null);
      setApiKeysError(json && "error" in json ? json.error ?? "Unable to load API keys" : "Unable to load API keys");
      return;
    }
    const json = ((await res.json().catch(() => null)) as PortalApiKeysResponse | null) ?? null;
    if (!json?.ok) {
      setApiKeysState(null);
      setApiKeysError((json as any)?.error ?? "Unable to load API keys");
      return;
    }
    setApiKeysState(json);
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

  function resetApiKeyComposer() {
    setEditingApiKeyId(null);
    setNewApiKeyName("");
    setNewApiKeyPermissions(["pura.chat", "people"]);
    setNewApiKeyCreditLimitEnabled(false);
    setNewApiKeyCreditLimit("");
  }

  function startEditingApiKey(apiKey: PortalApiKeySummary) {
    setEditingApiKeyId(apiKey.id);
    setNewApiKeyName(apiKey.name);
    setNewApiKeyPermissions(apiKey.permissions);
    setNewApiKeyCreditLimitEnabled(apiKey.creditLimit !== null);
    setNewApiKeyCreditLimit(apiKey.creditLimit !== null ? String(apiKey.creditLimit) : "");
    setApiKeyModalOpen(true);
  }

  function toggleApiKeyPermission(permission: PortalApiKeyPermission) {
    setNewApiKeyPermissions((current) =>
      current.includes(permission) ? current.filter((entry) => entry !== permission) : [...current, permission],
    );
  }

  async function createApiKey() {
    if (!canCreateApiKey) return;
    setSavingApiKey(true);
    const creditLimit = newApiKeyCreditLimitEnabled ? Number(newApiKeyCreditLimit) : null;
    const res = await fetch(
      editingApiKeyId ? `/api/portal/integrations/api-keys/${encodeURIComponent(editingApiKeyId)}` : "/api/portal/integrations/api-keys",
      {
        method: editingApiKeyId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newApiKeyName.trim(),
          permissions: newApiKeyPermissions,
          creditLimit: Number.isFinite(creditLimit) ? creditLimit : null,
        }),
      },
    ).catch(() => null as any);

    const json = (res ? ((await res.json().catch(() => null)) as any) : null) ?? null;
    setSavingApiKey(false);
    if (!res?.ok || !json?.ok) {
      setApiKeysError(json?.error ?? (editingApiKeyId ? "Unable to update API key" : "Unable to create API key"));
      return;
    }

    if (!editingApiKeyId && json?.key?.id && typeof json?.value === "string") {
      setRevealedApiKeyValues((current) => ({ ...current, [json.key.id]: json.value }));
    }

    setApiKeyModalOpen(false);
    resetApiKeyComposer();
    await loadApiKeys();
    toast.success(editingApiKeyId ? "API key updated" : "API key created");
  }

  async function deleteApiKey(keyId: string) {
    setDeletingApiKeyId(keyId);
    const res = await fetch(`/api/portal/integrations/api-keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    }).catch(() => null as any);
    const json = (res ? ((await res.json().catch(() => null)) as any) : null) ?? null;
    setDeletingApiKeyId(null);
    if (!res?.ok || !json?.ok) {
      setApiKeysError(json?.error ?? "Unable to delete API key");
      return;
    }
    setRevealedApiKeyValues((current) => {
      const next = { ...current };
      delete next[keyId];
      return next;
    });
    await loadApiKeys();
    toast.success("API key deleted");
  }

  async function revealApiKey(keyId: string) {
    if (revealedApiKeyValues[keyId]) {
      setRevealedApiKeyValues((current) => {
        const next = { ...current };
        delete next[keyId];
        return next;
      });
      return;
    }

    setRevealingApiKeyId(keyId);
    const res = await fetch(`/api/portal/integrations/api-keys/${encodeURIComponent(keyId)}/reveal`, {
      method: "POST",
    }).catch(() => null as any);
    const json = (res ? ((await res.json().catch(() => null)) as any) : null) ?? null;
    setRevealingApiKeyId(null);
    if (!res?.ok || !json?.ok || typeof json?.value !== "string") {
      setApiKeysError(json?.error ?? "Unable to reveal API key");
      return;
    }
    setRevealedApiKeyValues((current) => ({ ...current, [keyId]: json.value }));
  }

  // Stripe connect/disconnect is handled via connectSelectedProvider/disconnectSelectedProvider.

  const canSaveMailbox = useMemo(() => {
    if (!mailbox || !mailbox.canChange) return false;
    const next = mailboxLocalPart.trim();
    if (next.length < 2) return false;
    if (next.toLowerCase() === String(mailbox.localPart || "").toLowerCase()) return false;
    return true;
  }, [mailbox, mailboxLocalPart]);

  const twilioHasPendingChanges = useMemo(() => {
    const nextFrom = twilioFromNumber.trim();
    const currentFrom = String(twilioMasked?.fromNumberE164 || "").trim();
    return Boolean(twilioAccountSid.trim() || twilioAuthToken.trim() || nextFrom !== currentFrom);
  }, [twilioAccountSid, twilioAuthToken, twilioFromNumber, twilioMasked?.fromNumberE164]);

  const activeSalesProvider = salesStatus?.ok === true ? salesStatus.activeProvider : null;
  const selectedSalesConfigured = salesStatus?.ok === true ? Boolean(salesStatus.providers[salesProvider]?.configured) : false;

  const salesProviderFormReady = useMemo(() => {
    switch (salesProvider) {
      case "stripe":
        return stripeSecretKey.trim().length > 0;
      case "authorizenet":
        return authNetLoginId.trim().length > 0 && authNetTxKey.trim().length > 0;
      case "braintree":
        return braintreeMerchantId.trim().length > 0 && braintreePublicKey.trim().length > 0 && braintreePrivateKey.trim().length > 0;
      case "razorpay":
        return razorpayKeyId.trim().length > 0 && razorpayKeySecret.trim().length > 0;
      case "paystack":
        return paystackSecretKey.trim().length > 0;
      case "flutterwave":
        return flutterwaveSecretKey.trim().length > 0;
      case "mollie":
        return mollieApiKey.trim().length > 0;
      case "mercadopago":
        return mercadoPagoAccessToken.trim().length > 0;
      default:
        return false;
    }
  }, [
    authNetLoginId,
    authNetTxKey,
    braintreeMerchantId,
    braintreePrivateKey,
    braintreePublicKey,
    flutterwaveSecretKey,
    mercadoPagoAccessToken,
    mollieApiKey,
    paystackSecretKey,
    razorpayKeyId,
    razorpayKeySecret,
    salesProvider,
    stripeSecretKey,
  ]);

  const salesProviderDirty = useMemo(() => {
    if (salesProvider !== activeSalesProvider) return true;
    switch (salesProvider) {
      case "stripe":
        return stripeSecretKey.trim().length > 0;
      case "authorizenet":
        return authNetLoginId.trim().length > 0 || authNetTxKey.trim().length > 0;
      case "braintree":
        return braintreeMerchantId.trim().length > 0 || braintreePublicKey.trim().length > 0 || braintreePrivateKey.trim().length > 0;
      case "razorpay":
        return razorpayKeyId.trim().length > 0 || razorpayKeySecret.trim().length > 0;
      case "paystack":
        return paystackSecretKey.trim().length > 0;
      case "flutterwave":
        return flutterwaveSecretKey.trim().length > 0;
      case "mollie":
        return mollieApiKey.trim().length > 0;
      case "mercadopago":
        return mercadoPagoAccessToken.trim().length > 0;
      default:
        return false;
    }
  }, [
    activeSalesProvider,
    authNetLoginId,
    authNetTxKey,
    braintreeMerchantId,
    braintreePrivateKey,
    braintreePublicKey,
    flutterwaveSecretKey,
    mercadoPagoAccessToken,
    mollieApiKey,
    paystackSecretKey,
    razorpayKeyId,
    razorpayKeySecret,
    salesProvider,
    stripeSecretKey,
  ]);

  const fullAccessApiKey = apiKeysState?.fullAccessKey ?? null;
  const scopedApiKeys = apiKeysState?.scopedKeys ?? [];

  const canCreateApiKey = useMemo(() => {
    if (newApiKeyName.trim().length < 2) return false;
    if (!newApiKeyPermissions.length) return false;
    if (!newApiKeyCreditLimitEnabled) return true;
    const limit = Number(newApiKeyCreditLimit);
    return Number.isFinite(limit) && limit > 0;
  }, [newApiKeyCreditLimit, newApiKeyCreditLimitEnabled, newApiKeyName, newApiKeyPermissions]);

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
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
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
          {showSuggestedSetup ? <SuggestedSetupSection canEdit={canEditBusinessInfo} /> : null}
          {showContactSection ? (
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
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
                    onClick={saveContact}
                    disabled={!canSaveContact || savingContact}
                  >
                    {savingContact ? "Saving…" : canSaveContact ? "Save changes" : "Saved"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                    onClick={() => setPasswordModalOpen(true)}
                    disabled={!canEditProfile}
                  >
                    Change password
                  </button>
                </div>
              </PortalSettingsSection>
            </div>
          </div>
          ) : null}

          {showAdvancedToggle ? (
            <div
              ref={advancedRef}
              className={embedded ? "scroll-mt-24" : "scroll-mt-24 rounded-3xl border border-zinc-200 bg-white p-6"}
            >
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="inline-flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 sm:w-auto"
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
          ) : null}

          {((showAdvancedToggle && advancedOpen) || !showAdvancedToggle) ? (
            <div className="space-y-4">
              {showAdvancedToggle ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {showIntegrationSections ? (
                    <button
                      type="button"
                      onClick={() => requestAdvancedScroll("domains")}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                    >
                      Domains & DNS
                    </button>
                  ) : null}
                  {showIntegrationSections && (canViewTwilio || canViewWebhooks) ? (
                    <button
                      type="button"
                      onClick={() => requestAdvancedScroll("twilio")}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                    >
                      Twilio & webhooks
                    </button>
                  ) : null}
                  {showIntegrationSections ? (
                    <button
                      type="button"
                      onClick={() => requestAdvancedScroll("salesReporting")}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                    >
                      Sales reporting
                    </button>
                  ) : null}
                  {showIntegrationSections ? (
                    <button
                      type="button"
                      onClick={() => requestAdvancedScroll("apiKeys")}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                    >
                      API keys
                    </button>
                  ) : null}
                  {showBusinessSections && portalMe?.ok === true ? (
                    <button
                      type="button"
                      onClick={() => requestAdvancedScroll("businessEmail")}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                    >
                      Business email
                    </button>
                  ) : null}
                  {showBusinessSections && canViewBusinessInfo ? (
                    <button
                      type="button"
                      onClick={() => requestAdvancedScroll("businessInfo")}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-blue-50 hover:text-(--color-brand-blue) focus-visible:outline-none focus-visible:text-(--color-brand-blue) focus-visible:underline"
                    >
                      Business info
                    </button>
                  ) : null}
                </div>
              ) : null}

              {showIntegrationSections ? (
                <div ref={domainsRef} className="scroll-mt-24">
                  <PortalSettingsSection
                    title="Domains & DNS"
                    description="Add domains, copy the exact DNS records, and verify them right here."
                    accent="blue"
                    collapsible={false}
                    dotClassName="hidden"
                    variant={sectionVariant}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-start">
                        <button
                          type="button"
                          onClick={() => setDomainComposerOpen((current) => !current)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-blue text-lg font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
                          aria-label={domainComposerOpen ? "Close add domain" : "Open add domain"}
                          title={domainComposerOpen ? "Close" : "Add domain"}
                        >
                          {domainComposerOpen ? "−" : "+"}
                        </button>
                      </div>

                      {domainComposerOpen ? (
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                          <div className="font-semibold text-zinc-900">Add a custom domain</div>
                          <div className="mt-1">Enter the domain you want to use, then expand it below to see the DNS records and verification tools.</div>
                          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <input
                              value={domainInput}
                              onChange={(e) => setDomainInput(e.target.value)}
                              placeholder="example.com"
                              className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                            />
                            <button
                              type="button"
                              onClick={() => void addDomain()}
                              disabled={domainBusy || !domainInput.trim()}
                              className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-4 py-3 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
                            >
                              {domainBusy ? "Adding…" : "Add domain"}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {!funnelDomainsLoaded ? (
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">Loading domains…</div>
                      ) : funnelDomains.length ? (
                        <div className="space-y-3">
                          {funnelDomains.map((domain) => {
                            const verified = String(domain.status || "").toUpperCase() === "VERIFIED";
                            const apex = isLikelyApexDomain(domain.domain);
                            const expanded = Boolean(expandedDomains[domain.id]);
                            return (
                              <div key={domain.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedDomains((current) => ({
                                      ...current,
                                      [domain.id]: !current[domain.id],
                                    }))
                                  }
                                  className="flex w-full items-center justify-between gap-3 rounded-2xl text-left transition-all duration-150 hover:-translate-y-0.5"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-zinc-900">{domain.domain}</div>
                                    <div className="mt-1 text-xs text-zinc-500">
                                      {domain.status || "Pending"}
                                      {domain.verifiedAt ? ` · Verified ${new Date(domain.verifiedAt).toLocaleDateString()}` : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={classNames(
                                        "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold",
                                        verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
                                      )}
                                    >
                                      {verified ? "Ready" : "Needs DNS"}
                                    </span>
                                    <span
                                      className={classNames(
                                        "inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-transform duration-150",
                                        expanded ? "-rotate-90" : "rotate-90",
                                      )}
                                      aria-hidden
                                    >
                                      <IconChevron />
                                    </span>
                                  </div>
                                </button>

                                {expanded ? (
                                  <>
                                    <div className="mt-4 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">DNS records to add</div>
                                      <table className="mt-3 w-full min-w-130 border-separate border-spacing-0">
                                        <thead>
                                          <tr>
                                            <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Type</th>
                                            <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Host / Name</th>
                                            <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Value</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {apex ? (
                                            <>
                                              <tr>
                                                <td className="border-b border-zinc-100 py-2 text-xs font-semibold text-zinc-900">ALIAS / ANAME</td>
                                                <td className="border-b border-zinc-100 py-2 text-xs">
                                                  <button type="button" onClick={() => void copyText("@")} className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 font-mono text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:text-brand-blue">
                                                    @ <IconCopy size={14} />
                                                  </button>
                                                </td>
                                                <td className="border-b border-zinc-100 py-2 text-xs">
                                                  <button type="button" onClick={() => void copyText(platformTargetHost)} className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 font-mono text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:text-brand-blue">
                                                    {platformTargetHost} <IconCopy size={14} />
                                                  </button>
                                                </td>
                                              </tr>
                                              <tr>
                                                <td className="border-b border-zinc-100 py-2 text-xs font-semibold text-zinc-900">A</td>
                                                <td className="border-b border-zinc-100 py-2 text-xs">
                                                  <button type="button" onClick={() => void copyText("@")} className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 font-mono text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:text-brand-blue">
                                                    @ <IconCopy size={14} />
                                                  </button>
                                                </td>
                                                <td className="border-b border-zinc-100 py-2 text-xs">
                                                  <button type="button" onClick={() => void copyText("76.76.21.21")} className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 font-mono text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:text-brand-blue">
                                                    76.76.21.21 <IconCopy size={14} />
                                                  </button>
                                                </td>
                                              </tr>
                                              <tr>
                                                <td className="border-b border-zinc-100 py-2 text-xs font-semibold text-zinc-900">CNAME</td>
                                                <td className="border-b border-zinc-100 py-2 text-xs">
                                                  <button type="button" onClick={() => void copyText("www")} className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 font-mono text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:text-brand-blue">
                                                    www <IconCopy size={14} />
                                                  </button>
                                                </td>
                                                <td className="border-b border-zinc-100 py-2 text-xs">
                                                  <button type="button" onClick={() => void copyText(platformTargetHost)} className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 font-mono text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:text-brand-blue">
                                                    {platformTargetHost} <IconCopy size={14} />
                                                  </button>
                                                </td>
                                              </tr>
                                            </>
                                          ) : (
                                            <tr>
                                              <td className="border-b border-zinc-100 py-2 text-xs font-semibold text-zinc-900">CNAME</td>
                                              <td className="border-b border-zinc-100 py-2 text-xs">
                                                <button type="button" onClick={() => void copyText(deriveDnsHostLabel(domain.domain))} className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 font-mono text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:text-brand-blue">
                                                  {deriveDnsHostLabel(domain.domain)} <IconCopy size={14} />
                                                </button>
                                              </td>
                                              <td className="border-b border-zinc-100 py-2 text-xs">
                                                <button type="button" onClick={() => void copyText(platformTargetHost)} className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 font-mono text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:text-brand-blue">
                                                  {platformTargetHost} <IconCopy size={14} />
                                                </button>
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                      <div className="mt-3 text-xs text-zinc-600">Use these exact values in your DNS provider, then click verify.</div>
                                    </div>

                                    <div className="mt-4 grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
                                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                                        Root behavior: <span className="font-semibold text-zinc-900">{domain.rootMode || "DIRECTORY"}</span>
                                      </div>
                                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                                        Root funnel: <span className="font-semibold text-zinc-900">{domain.rootFunnelSlug || "None selected"}</span>
                                      </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void verifyDomain(domain)}
                                        disabled={Boolean(domainVerifyBusy[domain.id])}
                                        className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
                                      >
                                        {domainVerifyBusy[domain.id] ? "Verifying…" : verified ? "Re-check DNS" : "Verify DNS"}
                                      </button>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">No custom domains have been added yet.</div>
                      )}
                    </div>
                  </PortalSettingsSection>
                </div>
              ) : null}

              {showIntegrationSections && (canViewTwilio || canViewWebhooks) ? (
                <div ref={twilioRef} className="scroll-mt-24">
                  <PortalSettingsSection
                    title="Twilio & webhooks"
                    description="Connection status up front, with Twilio credentials and webhook copy/paste tools tucked under the same dropdown."
                    accent="blue"
                    collapsible={false}
                    dotClassName="hidden"
                    variant={sectionVariant}
                  >
                    <div className="space-y-3">
                      {twilioNote ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{twilioNote}</div>
                      ) : null}

                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <button
                            type="button"
                            onClick={() => setTwilioExpanded((current) => !current)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left transition-all duration-150 hover:-translate-y-0.5"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-900">Twilio connection</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                <span>
                                  Status: <span className="font-semibold text-zinc-900">{twilioMasked?.configured ? "Connected" : "Not connected"}</span>
                                </span>
                                <span>•</span>
                                <span>
                                  From: <span className="font-mono text-zinc-900">{twilioMasked?.fromNumberE164 ?? (twilioFromNumber.trim() || "Not set")}</span>
                                </span>
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <span
                              className={classNames(
                                "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold",
                                twilioMasked?.configured ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-700",
                              )}
                            >
                              {twilioMasked?.configured ? "Ready" : "Setup needed"}
                            </span>
                            <button
                              type="button"
                              onClick={() => setTwilioExpanded((current) => !current)}
                              className={classNames(
                                "inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-transform duration-150 hover:-translate-y-0.5",
                                twilioExpanded ? "-rotate-90" : "rotate-90",
                              )}
                              aria-label={twilioExpanded ? "Collapse Twilio settings" : "Expand Twilio settings"}
                            >
                              <IconChevron />
                            </button>
                          </div>
                        </div>

                        {twilioExpanded ? (
                          <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
                            {!canEditTwilio ? (
                              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">You have view-only access.</div>
                            ) : null}

                            {canViewTwilio ? (
                              <>
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
                                      disabled={savingTwilio || !twilioHasPendingChanges}
                                      className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
                                    >
                                      {savingTwilio ? "Saving…" : twilioHasPendingChanges ? "Save Twilio" : "No changes"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void clearTwilio()}
                                      disabled={savingTwilio || !twilioMasked?.configured}
                                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            ) : null}

                            {canViewWebhooks ? (
                              <div className="space-y-3">
                                <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                                  <div className="font-semibold text-zinc-900">Webhook URLs</div>
                                  <div className="mt-1 text-xs text-zinc-500">Paste these into Twilio when you need to route calls into your AI Receptionist or fallback flow.</div>
                                </div>
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
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </PortalSettingsSection>
                </div>
              ) : null}

              {showIntegrationSections ? (
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

                      {!canEditProfile ? (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">You have view-only access.</div>
                      ) : null}

                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <button
                            type="button"
                            onClick={() => setSalesReportingExpanded((current) => !current)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left transition-all duration-150 hover:-translate-y-0.5"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-900">Sales reporting connection</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                <span>
                                  Provider: <span className="font-semibold text-zinc-900">{providerLabel(salesProvider)}</span>
                                </span>
                                <span>•</span>
                                <span>
                                  Status: <span className="font-semibold text-zinc-900">{selectedSalesConfigured ? "Connected" : "Not connected"}</span>
                                </span>
                              </div>
                            </div>
                          </button>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href="/portal/app/services/reporting/sales"
                              className="inline-flex items-center justify-center rounded-2xl px-2 py-1 text-sm font-semibold text-(--color-brand-blue) underline underline-offset-4 transition-transform duration-150 hover:-translate-y-0.5"
                            >
                              Open Sales Dashboard →
                            </Link>
                            <button
                              type="button"
                              onClick={() => setSalesReportingExpanded((current) => !current)}
                              className={classNames(
                                "inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-transform duration-150 hover:-translate-y-0.5",
                                salesReportingExpanded ? "-rotate-90" : "rotate-90",
                              )}
                              aria-label={salesReportingExpanded ? "Collapse sales reporting settings" : "Expand sales reporting settings"}
                            >
                              <IconChevron />
                            </button>
                          </div>
                        </div>

                        {salesReportingExpanded ? (
                          <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
                            <div className="text-xs font-semibold text-zinc-600">Provider</div>
                            <div>
                              <PortalListboxDropdown
                                value={salesProvider}
                                options={SALES_REPORTING_PROVIDER_OPTIONS}
                                onChange={(v) => setSalesProvider(v)}
                                disabled={stripeSaving}
                                portal={false}
                              />
                            </div>

                            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
                              <div>
                                Connected: <span className="font-semibold text-zinc-900">{selectedSalesConfigured ? "Yes" : "No"}</span>
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
                                  Details: <span className="font-mono">{salesStatus?.ok === true ? salesStatus.providers[salesProvider]?.displayHint ?? "N/A" : "N/A"}</span>
                                </div>
                              )}
                            </div>

                            <div className="space-y-3">
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
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void connectSelectedProvider()}
                                  disabled={!canEditProfile || stripeSaving || !(salesStatus?.ok === true && salesStatus.encryptionConfigured) || !salesProviderDirty || !salesProviderFormReady}
                                  className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
                                >
                                  {stripeSaving
                                    ? "Saving…"
                                    : salesProvider === activeSalesProvider && selectedSalesConfigured
                                      ? `Replace ${providerLabel(salesProvider)}`
                                      : `Connect ${providerLabel(salesProvider)}`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void disconnectSelectedProvider()}
                                  disabled={!canEditProfile || stripeSaving || !selectedSalesConfigured}
                                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                                >
                                  Disconnect
                                </button>
                              </div>
                              {!salesProviderDirty ? <div className="text-xs text-zinc-500">Make a change to save this provider.</div> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </PortalSettingsSection>
                </div>
              ) : null}

              {showIntegrationSections ? (
                <div ref={apiKeysRef} className="scroll-mt-24">
                  <PortalSettingsSection
                    title="API keys"
                    description="Create account-specific keys, reveal them only when needed, and control limits and permissions per integration."
                    accent="blue"
                    collapsible={false}
                    dotClassName="hidden"
                    variant={sectionVariant}
                  >
                    <div className="space-y-4">
                      {apiKeysError ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{apiKeysError}</div>
                      ) : null}

                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <button
                            type="button"
                            onClick={() => setApiKeysExpanded((current) => !current)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left transition-all duration-150 hover:-translate-y-0.5"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-900">API keys overview</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                <span>
                                  Keys: <span className="font-semibold text-zinc-900">{apiKeysState?.totalKeyCount ?? 0}</span>
                                </span>
                                <span>•</span>
                                <span>
                                  Credits used: <span className="font-semibold text-zinc-900">{(apiKeysState?.totalCreditsUsed ?? 0).toLocaleString()}</span>
                                </span>
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                resetApiKeyComposer();
                                setApiKeyModalOpen(true);
                              }}
                              className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
                            >
                              Create API Key
                            </button>
                            <button
                              type="button"
                              onClick={() => setApiKeysExpanded((current) => !current)}
                              className={classNames(
                                "inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-transform duration-150 hover:-translate-y-0.5",
                                apiKeysExpanded ? "-rotate-90" : "rotate-90",
                              )}
                              aria-label={apiKeysExpanded ? "Collapse API key settings" : "Expand API key settings"}
                            >
                              <IconChevron />
                            </button>
                          </div>
                        </div>

                        {apiKeysExpanded ? (
                          <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
                            {!apiKeysLoaded ? (
                              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">Loading API keys…</div>
                            ) : null}

                            {fullAccessApiKey ? (
                              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-sm font-semibold text-zinc-900">Full access API key</div>
                                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                        Full access
                                      </span>
                                    </div>
                                    <div className="mt-2 text-xs text-zinc-500">Use this only for trusted internal integrations that need full portal and Pura access.</div>
                                    <div className="mt-3 break-all rounded-2xl border border-zinc-200 bg-white px-4 py-3 font-mono text-xs text-zinc-800">
                                      {revealedApiKeyValues[fullAccessApiKey.id] ?? fullAccessApiKey.maskedValue}
                                    </div>
                                    <div className="mt-3 text-xs text-zinc-500">Last used {formatApiKeyTimestamp(fullAccessApiKey.lastUsedAtIso)}</div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void revealApiKey(fullAccessApiKey.id)}
                                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                                    >
                                      {revealedApiKeyValues[fullAccessApiKey.id] ? <IconEyeOffGlyph size={16} className="mr-2" /> : <IconEyeGlyph size={16} className="mr-2" />}
                                      {revealingApiKeyId === fullAccessApiKey.id
                                        ? "Loading…"
                                        : revealedApiKeyValues[fullAccessApiKey.id]
                                          ? "Hide"
                                          : "Reveal"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void copyText(revealedApiKeyValues[fullAccessApiKey.id] ?? fullAccessApiKey.maskedValue)}
                                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                                    >
                                      <IconCopy size={16} className="mr-2" />
                                      Copy
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {scopedApiKeys.length ? (
                        <div className="space-y-3">
                          {scopedApiKeys.map((apiKey) => (
                            <div key={apiKey.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-semibold text-zinc-900">{apiKey.name}</div>
                                    {apiKey.creditLimit !== null ? (
                                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                                        Limit {apiKey.creditLimit.toLocaleString()} · Used {apiKey.creditsUsed.toLocaleString()}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                                        No credit limit · Used {apiKey.creditsUsed.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2 break-all rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-xs text-zinc-800">
                                    {revealedApiKeyValues[apiKey.id] ?? apiKey.maskedValue}
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {apiKey.permissions.map((permission) => {
                                      const option = PORTAL_API_KEY_PERMISSION_OPTIONS.find((entry) => entry.value === permission);
                                      return (
                                        <span key={permission} className="inline-flex items-center rounded-full bg-brand-blue/10 px-3 py-1 text-[11px] font-semibold text-brand-blue">
                                          {option?.label ?? permission}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-3 text-xs text-zinc-500">
                                    Created {formatApiKeyTimestamp(apiKey.createdAtIso)} · Last used {formatApiKeyTimestamp(apiKey.lastUsedAtIso)}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void revealApiKey(apiKey.id)}
                                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                                  >
                                    {revealedApiKeyValues[apiKey.id] ? <IconEyeOffGlyph size={16} className="mr-2" /> : <IconEyeGlyph size={16} className="mr-2" />}
                                    {revealingApiKeyId === apiKey.id ? "Loading…" : revealedApiKeyValues[apiKey.id] ? "Hide" : "Reveal"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void copyText(revealedApiKeyValues[apiKey.id] ?? apiKey.maskedValue)}
                                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                                  >
                                    <IconCopy size={16} className="mr-2" />
                                    Copy
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditingApiKey(apiKey)}
                                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteApiKey(apiKey.id)}
                                    disabled={deletingApiKeyId === apiKey.id}
                                    className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:bg-red-700"
                                  >
                                    {deletingApiKeyId === apiKey.id ? "Deleting…" : "Delete"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                            ) : apiKeysLoaded ? (
                              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No scoped API keys yet.</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </PortalSettingsSection>
                </div>
              ) : null}

              {showBusinessSections && canViewBusinessInfo ? (
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

              {showBusinessSections && portalMe?.ok === true ? (
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

                      {mailbox?.canChange ? (
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
                                className="w-full rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
                              >
                                {mailboxSaving ? "Saving…" : canSaveMailbox ? "Save" : "Saved"}
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-zinc-500">After saving, this will be locked.</div>
                        </div>
                      ) : null}
                    </div>
                  </PortalSettingsSection>
                </div>
              ) : null}
            </div>
          ) : null}

          <AppModal
            open={apiKeyModalOpen}
            title={editingApiKeyId ? "Edit API key" : "Create API key"}
            description="Create a scoped key for your own software to access the portal and Pura with only the permissions it needs."
            onClose={() => {
              setApiKeyModalOpen(false);
              resetApiKeyComposer();
            }}
            widthClassName="w-[min(760px,calc(100vw-32px))]"
            hideHeaderDivider
            hideFooterDivider
            footer={
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                  onClick={() => {
                    setApiKeyModalOpen(false);
                    resetApiKeyComposer();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void createApiKey()}
                  disabled={!canCreateApiKey || savingApiKey}
                  className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
                >
                  {savingApiKey ? "Saving…" : editingApiKeyId ? "Save changes" : "Create key"}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700">Key name</label>
                <input
                  value={newApiKeyName}
                  onChange={(e) => setNewApiKeyName(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-zinc-300"
                  placeholder="Ex: CRM sync, internal dashboard, Pura embed"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-700">Permissions</div>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {PORTAL_API_KEY_PERMISSION_OPTIONS.map((option) => {
                    const checked = newApiKeyPermissions.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleApiKeyPermission(option.value)}
                        className={classNames(
                          "flex items-start justify-between gap-3 rounded-2xl border bg-white p-4 text-left transition-all duration-150 hover:-translate-y-0.5",
                          checked ? "border-brand-blue bg-brand-blue/5" : "border-zinc-200",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-900">{option.label}</span>
                          <span className="mt-1 block text-xs text-zinc-500">{option.description}</span>
                        </span>
                        <ToggleChip checked={checked} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <button
                  type="button"
                  onClick={() => setNewApiKeyCreditLimitEnabled((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-zinc-900"
                >
                  <span>Set a credit limit for this key</span>
                  <ToggleChip checked={newApiKeyCreditLimitEnabled} />
                </button>
                {newApiKeyCreditLimitEnabled ? (
                  <div className="mt-3">
                    <label className="text-xs font-semibold text-zinc-700">Credit limit</label>
                    <input
                      value={newApiKeyCreditLimit}
                      onChange={(e) => setNewApiKeyCreditLimit(e.target.value.replace(/[^0-9]/g, ""))}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-zinc-300"
                      placeholder="Ex: 5000"
                    />
                    <div className="mt-2 text-xs text-zinc-500">Use this to cap how many credits this integration is allowed to consume.</div>
                  </div>
                ) : null}
              </div>
            </div>
          </AppModal>

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
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                  onClick={() => setContactPasswordModalOpen(false)}
                  disabled={savingContact}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void doSaveContact({ passwordOverride: contactPasswordDraft })}
                  disabled={contactPasswordDraft.trim().length < 6 || savingContact}
                  className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
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
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                  onClick={() => setPasswordModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={changePassword}
                  disabled={!canSavePassword || savingPassword}
                  className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
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
