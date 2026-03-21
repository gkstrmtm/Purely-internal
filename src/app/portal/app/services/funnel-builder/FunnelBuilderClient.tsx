"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { AppConfirmModal } from "@/components/AppModal";
import { PortalBackToOnboardingLink } from "@/components/PortalBackToOnboardingLink";
import { hostedFunnelPath, hostedFormPath } from "@/lib/publicHostedKeys";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

type CreditFunnel = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  assignedDomain?: string | null;
};

type CreditForm = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
};

type CreditDomain = {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFIED";
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rootMode?: "DISABLED" | "DIRECTORY" | "REDIRECT";
  rootFunnelSlug?: string | null;
};

type RootMode = "DISABLED" | "DIRECTORY" | "REDIRECT";

type TabKey = "funnels" | "forms" | "settings";

type VercelVerificationRecord = {
  type: string;
  host: string;
  value: string;
};

type StripeIntegrationStatus = {
  configured: boolean;
  accountId: string | null;
  connectedAtIso: string | null;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function funnelStatusLabel(
  f: { status: "DRAFT" | "ACTIVE" | "ARCHIVED"; assignedDomain?: string | null },
  assignedDomainStatus: "PENDING" | "VERIFIED" | null,
) {
  if (f.status === "ARCHIVED") return "ARCHIVED";
  if (f.assignedDomain) return assignedDomainStatus === "VERIFIED" ? "LIVE" : "PENDING";
  if (f.status === "ACTIVE") return "LIVE";
  return "DRAFT";
}

function statusPillClass(label: string) {
  const s = String(label || "").trim().toUpperCase();
  if (s === "LIVE" || s === "ACTIVE") return "border-green-200 bg-green-50 text-green-800";
  if (s === "PENDING") return "border-amber-200 bg-amber-50 text-amber-900";
  if (s === "ARCHIVED") return "border-zinc-200 bg-zinc-50 text-zinc-500";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 7.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5zm0 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5zm0 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z" />
    </svg>
  );
}

function normalizeSlug(raw: string) {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
  return cleaned;
}

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

function coercePlatformTargetHost(): string | null {
  const explicit = (process.env.NEXT_PUBLIC_CUSTOM_DOMAIN_TARGET_HOST || "").trim();
  if (explicit) return explicit;

  // Default: Vercel target for custom domains.
  return "cname.vercel-dns.com";
}

function extractVercelVerificationRecords(raw: unknown): VercelVerificationRecord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .map((v) => {
      const type = typeof v?.type === "string" ? v.type.trim() : "";
      const host = typeof v?.domain === "string" ? v.domain.trim() : "";
      const value = typeof v?.value === "string" ? v.value.trim() : "";
      if (!type || !host || !value) return null;
      return { type, host, value };
    })
    .filter(Boolean) as VercelVerificationRecord[];
}

function deriveVerificationHostLabels(recordHost: string, apexDomain: string): { display: string; full: string } {
  const full = String(recordHost || "").trim().replace(/\.+$/, "");
  const domain = String(apexDomain || "").trim().replace(/\.+$/, "");
  if (!full) return { display: "", full: "" };
  if (!domain) return { display: full, full };

  const fullLower = full.toLowerCase();
  const domainLower = domain.toLowerCase();
  if (fullLower === domainLower) return { display: "@", full };

  const suffix = `.${domainLower}`;
  if (fullLower.endsWith(suffix) && full.length > domain.length + 1) {
    const prefix = full.slice(0, full.length - (domain.length + 1));
    return { display: prefix || "@", full };
  }

  return { display: full, full };
}

export function FunnelBuilderClient(props: { initialTab?: TabKey } = {}) {
  const { initialTab } = props;
  const pathname = usePathname();
  const basePath = pathname === "/credit" || pathname.startsWith("/credit/") ? "/credit" : "/portal";

  const [tab, setTab] = useState<TabKey>(initialTab ?? "funnels");

  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
  }, [initialTab]);

  const [funnels, setFunnels] = useState<CreditFunnel[] | null>(null);
  const [forms, setForms] = useState<CreditForm[] | null>(null);
  const [domains, setDomains] = useState<CreditDomain[] | null>(null);

  const [creatingKind, setCreatingKind] = useState<"funnel" | "form" | null>(null);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [funnelDeleteBusy, setFunnelDeleteBusy] = useState<Record<string, boolean>>({});
  const [formDeleteBusy, setFormDeleteBusy] = useState<Record<string, boolean>>({});

  const [deleteDialog, setDeleteDialog] = useState<
    | { type: "funnel"; id: string }
    | { type: "form"; id: string }
    | null
  >(null);

  const pendingDeleteFunnel = useMemo(() => {
    if (!deleteDialog || deleteDialog.type !== "funnel") return null;
    const id = deleteDialog.id;
    return (funnels || []).find((f) => f.id === id) || null;
  }, [deleteDialog, funnels]);

  const pendingDeleteForm = useMemo(() => {
    if (!deleteDialog || deleteDialog.type !== "form") return null;
    const id = deleteDialog.id;
    return (forms || []).find((f) => f.id === id) || null;
  }, [deleteDialog, forms]);

  const [domainInput, setDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainVercelVerificationById, setDomainVercelVerificationById] = useState<Record<string, VercelVerificationRecord[]>>({});
  const [domainSettingsBusy, setDomainSettingsBusy] = useState<Record<string, boolean>>({});
  const [domainSettingsError, setDomainSettingsError] = useState<Record<string, string | null>>({});
  const [domainVerifyBusy, setDomainVerifyBusy] = useState<Record<string, boolean>>({});
  const [domainVerifyError, setDomainVerifyError] = useState<Record<string, string | null>>({});

  const [stripeStatus, setStripeStatus] = useState<StripeIntegrationStatus | null>(null);
  const [stripeStatusBusy, setStripeStatusBusy] = useState(false);

  const [funnelDomainBusy, setFunnelDomainBusy] = useState<Record<string, boolean>>({});
  const [funnelDomainError, setFunnelDomainError] = useState<Record<string, string | null>>({});

  const [funnelStatusBusy, setFunnelStatusBusy] = useState<Record<string, boolean>>({});
  const [funnelStatusError, setFunnelStatusError] = useState<Record<string, string | null>>({});

  const [openFunnelMenuId, setOpenFunnelMenuId] = useState<string | null>(null);
  const funnelMenuRootRef = useRef<HTMLDivElement | null>(null);

  const [openFormMenuId, setOpenFormMenuId] = useState<string | null>(null);
  const formMenuRootRef = useRef<HTMLDivElement | null>(null);

  const loadStripeStatus = useCallback(async () => {
    setStripeStatusBusy(true);
    try {
      const res = await fetch("/api/portal/integrations/stripe", { cache: "no-store" }).catch(() => null as any);
      if (!res?.ok) return;
      const json = (await res.json().catch(() => null)) as any;
      if (!json || json.ok !== true || !json.stripe) return;
      setStripeStatus({
        configured: Boolean(json.stripe.configured),
        accountId: json.stripe.accountId ? String(json.stripe.accountId) : null,
        connectedAtIso: json.stripe.connectedAtIso ? String(json.stripe.connectedAtIso) : null,
      });
    } finally {
      setStripeStatusBusy(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "settings") return;
    void loadStripeStatus();
  }, [tab, loadStripeStatus]);

  useEffect(() => {
    if (!openFunnelMenuId) return;

    const close = () => setOpenFunnelMenuId(null);

    const onDown = (ev: MouseEvent) => {
      const root = funnelMenuRootRef.current;
      const target = ev.target;
      if (root && target && target instanceof Node && root.contains(target)) return;
      close();
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openFunnelMenuId]);

  useEffect(() => {
    if (!openFormMenuId) return;

    const close = () => setOpenFormMenuId(null);

    const onDown = (ev: MouseEvent) => {
      const root = formMenuRootRef.current;
      const target = ev.target;
      if (root && target && target instanceof Node && root.contains(target)) return;
      close();
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openFormMenuId]);

  const domainsByName = useMemo(() => {
    const m = new Map<string, CreditDomain>();
    for (const d of domains || []) {
      const k = String(d.domain || "").trim().toLowerCase();
      if (!k) continue;
      m.set(k, d);
    }
    return m;
  }, [domains]);

  const getAssignedDomainStatus = useCallback(
    (assignedDomain: string | null | undefined): "PENDING" | "VERIFIED" | null => {
      const clean = String(assignedDomain || "").trim().toLowerCase();
      if (!clean) return null;
      const d = domainsByName.get(clean);
      return d?.status ?? "PENDING";
    },
    [domainsByName],
  );

  const funnelDomainOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; hint?: string }> = [{ value: "", label: "Default (not assigned)" }];
    for (const d of domains || []) {
      opts.push({
        value: d.domain,
        label: d.domain,
        hint: d.status === "PENDING" ? "Pending DNS verification" : undefined,
      });
    }
    return opts;
  }, [domains]);

  const funnelPreviewBase = useMemo(() => toPurelyHostedUrl("/f"), []);
  const formPreviewBase = useMemo(() => toPurelyHostedUrl("/forms"), []);
  const platformTargetHost = useMemo(() => coercePlatformTargetHost(), []);
  const isLocalPreview = useMemo(() => {
    const h = (platformTargetHost || "").trim().toLowerCase();
    return h === "localhost" || h.endsWith(".local") || h === "127.0.0.1";
  }, [platformTargetHost]);

  const getFunnelLiveHref = useCallback(
    (assignedDomain: string | null | undefined, slug: string, funnelId: string) => {
      const cleanSlug = String(slug || "").trim();
      const cleanId = String(funnelId || "").trim();
      if (!cleanSlug || !cleanId) return null;

      const cleanDomain = String(assignedDomain || "").trim().toLowerCase();
      if (cleanDomain) {
        if (isLocalPreview) return `/domain-router/${encodeURIComponent(cleanDomain)}/${encodeURIComponent(cleanSlug)}`;
        return `https://${cleanDomain}/${encodeURIComponent(cleanSlug)}`;
      }

      const hostedPath = hostedFunnelPath(cleanSlug, cleanId);
      return hostedPath ? toPurelyHostedUrl(hostedPath) : null;
    },
    [isLocalPreview],
  );

  const getFormLiveHref = useCallback((slug: string, formId: string) => {
    const cleanSlug = String(slug || "").trim();
    const cleanId = String(formId || "").trim();
    if (!cleanSlug || !cleanId) return null;
    const hostedPath = hostedFormPath(cleanSlug, cleanId);
    return hostedPath ? toPurelyHostedUrl(hostedPath) : null;
  }, []);

  const loadFunnels = useCallback(async () => {
    const res = await fetch("/api/portal/funnel-builder/funnels", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load funnels");
    setFunnels(Array.isArray(json.funnels) ? json.funnels : []);
  }, []);

  const loadForms = useCallback(async () => {
    const res = await fetch("/api/portal/funnel-builder/forms", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load forms");
    setForms(Array.isArray(json.forms) ? json.forms : []);
  }, []);

  const loadDomains = useCallback(async () => {
    const res = await fetch("/api/portal/funnel-builder/domains", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load domains");
    setDomains(Array.isArray(json.domains) ? json.domains : []);
  }, []);

  const deleteFunnel = useCallback(
    async (f: CreditFunnel) => {
      if (funnelDeleteBusy[f.id]) return;
      setFunnelDeleteBusy((m) => ({ ...m, [f.id]: true }));
      setError(null);
      try {
        const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(f.id)}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Failed to delete funnel");
        setFunnels((prev) => (prev ? prev.filter((row) => row.id !== f.id) : prev));
        try {
          await loadDomains();
        } catch {
          // ignore
        }
      } catch (e) {
        setError((e as any)?.message ? String((e as any).message) : "Failed to delete funnel");
      } finally {
        setFunnelDeleteBusy((m) => ({ ...m, [f.id]: false }));
      }
    },
    [funnelDeleteBusy, loadDomains],
  );

  const deleteForm = useCallback(
    async (f: CreditForm) => {
      if (formDeleteBusy[f.id]) return;
      setFormDeleteBusy((m) => ({ ...m, [f.id]: true }));
      setError(null);
      try {
        const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(f.id)}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || json?.ok !== true) throw new Error(json?.error || "Failed to delete form");
        setForms((prev) => (prev ? prev.filter((row) => row.id !== f.id) : prev));
      } catch (e) {
        setError((e as any)?.message ? String((e as any).message) : "Failed to delete form");
      } finally {
        setFormDeleteBusy((m) => ({ ...m, [f.id]: false }));
      }
    },
    [formDeleteBusy],
  );

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(String(text || ""));
    } catch {
      // ignore
    }
  }, []);

  const verifyDomain = useCallback(
    async (domain: CreditDomain) => {
      setDomainVerifyBusy((m) => ({ ...m, [domain.id]: true }));
      setDomainVerifyError((m) => ({ ...m, [domain.id]: null }));

      try {
        const res = await fetch(`/api/portal/funnel-builder/domains/${encodeURIComponent(domain.id)}/verify`, {
          method: "POST",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Verification failed");

        const vercelRecords = extractVercelVerificationRecords(json?.debug?.vercel?.verification);
        const vercelVerified = json?.debug?.vercel?.ok === true && json?.debug?.vercel?.verified === true;
        if (json?.verified === true || vercelVerified) {
          setDomainVercelVerificationById((m) => {
            const next = { ...m };
            delete next[domain.id];
            return next;
          });
        } else if (vercelRecords.length) {
          setDomainVercelVerificationById((m) => ({ ...m, [domain.id]: vercelRecords }));
        }

        if (json.domain) {
          setDomains((prev) => {
            if (!prev) return prev;
            return prev.map((d) => (d.id === domain.id ? { ...d, ...json.domain } : d));
          });
        }

        if (json.verified === true && json.domain) {
          setDomains((prev) => {
            if (!prev) return prev;
            return prev.map((d) => (d.id === domain.id ? { ...d, ...json.domain } : d));
          });
          return;
        }

        const expectedTargetHost =
          typeof json?.debug?.expectedTargetHost === "string" ? String(json.debug.expectedTargetHost).trim() : "";
        const raw = typeof json?.error === "string" ? json.error : "";
        const isActionable =
          /^dns\s+is\s+pointing\s+correctly/i.test(raw) ||
          /^your\s+domain\s+has\s+/i.test(raw) ||
          /ssl|https|certificate|provision/i.test(raw) ||
          /contact\s+support/i.test(raw);

        const base = raw
          ? /dns\s+doesn\W?t\s+resolve/i.test(raw)
            ? "Not verified yet: your domain’s DNS isn’t pointing to Purely yet (or DNS propagation isn’t finished)."
            : /cname\s+doesn\W?t\s+point/i.test(raw)
              ? "Not verified yet: your CNAME record isn’t pointing to Purely yet (or DNS propagation isn’t finished)."
              : isActionable
                ? raw
                : `Not verified yet: ${raw}`
          : "Not verified yet. DNS changes can take a few minutes to propagate.";

        const hint = expectedTargetHost ? ` Expected target: ${expectedTargetHost}.` : "";

        const hasHostingRecords = vercelRecords.length > 0 || (domainVercelVerificationById[domain.id] || []).length > 0;
        const hostingHint = hasHostingRecords ? " See hosting verification records below." : "";

        setDomainVerifyError((m) => ({
          ...m,
          [domain.id]: `${base}${hint}${hostingHint}${isActionable ? "" : " Double-check the records below and try again in a few minutes."}`,
        }));
      } catch (e) {
        setDomainVerifyError((m) => ({
          ...m,
          [domain.id]: (e as any)?.message ? String((e as any).message) : "Verification failed",
        }));
      } finally {
        setDomainVerifyBusy((m) => ({ ...m, [domain.id]: false }));
      }
    },
    [domainVercelVerificationById],
  );

  const patchDomainSettings = useCallback(
    async (domain: CreditDomain, next: { rootMode: "DISABLED" | "DIRECTORY" | "REDIRECT"; rootFunnelSlug: string | null }) => {
      setDomainSettingsBusy((m) => ({ ...m, [domain.id]: true }));
      setDomainSettingsError((m) => ({ ...m, [domain.id]: null }));

      // Optimistic update
      setDomains((prev) => {
        if (!prev) return prev;
        return prev.map((d) => (d.id === domain.id ? { ...d, rootMode: next.rootMode, rootFunnelSlug: next.rootFunnelSlug } : d));
      });

      try {
        const res = await fetch("/api/portal/funnel-builder/domains", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain: domain.domain, rootMode: next.rootMode, rootFunnelSlug: next.rootFunnelSlug }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to update domain settings");

        setDomains((prev) => {
          if (!prev) return prev;
          return prev.map((d) =>
            d.id === domain.id
              ? { ...d, rootMode: json.rootMode, rootFunnelSlug: json.rootFunnelSlug ?? null }
              : d,
          );
        });
      } catch (e) {
        setDomainSettingsError((m) => ({
          ...m,
          [domain.id]: (e as any)?.message ? String((e as any).message) : "Failed to update domain settings",
        }));
        // Re-sync from server in case optimistic state diverged.
        try {
          await loadDomains();
        } catch {
          // ignore
        }
      } finally {
        setDomainSettingsBusy((m) => ({ ...m, [domain.id]: false }));
      }
    },
    [loadDomains],
  );

  const patchFunnelDomain = useCallback(
    async (funnel: CreditFunnel, nextDomain: string | null) => {
      setFunnelDomainBusy((m) => ({ ...m, [funnel.id]: true }));
      setFunnelDomainError((m) => ({ ...m, [funnel.id]: null }));

      // Optimistic update
      setFunnels((prev) => {
        if (!prev) return prev;
        return prev.map((f) => {
          if (f.id !== funnel.id) return f;
          return { ...f, assignedDomain: nextDomain };
        });
      });

      try {
        const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnel.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain: nextDomain }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to update funnel domain");
        const assigned = (json?.funnel?.assignedDomain ?? null) as string | null;
        const status = (json?.funnel?.status ?? null) as CreditFunnel["status"] | null;

        setFunnels((prev) => {
          if (!prev) return prev;
          return prev.map((f) =>
            f.id === funnel.id
              ? {
                  ...f,
                  assignedDomain: assigned,
                  status: status && (status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED") ? status : f.status,
                }
              : f,
          );
        });
      } catch (e) {
        setFunnelDomainError((m) => ({
          ...m,
          [funnel.id]: (e as any)?.message ? String((e as any).message) : "Failed to update funnel domain",
        }));
        try {
          await loadFunnels();
        } catch {
          // ignore
        }
      } finally {
        setFunnelDomainBusy((m) => ({ ...m, [funnel.id]: false }));
      }
    },
    [loadFunnels],
  );

  const patchFunnelStatus = useCallback(
    async (funnel: CreditFunnel, nextStatus: CreditFunnel["status"]) => {
      if (funnelStatusBusy[funnel.id]) return false;
      if (funnel.status === nextStatus) return true;

      setFunnelStatusBusy((m) => ({ ...m, [funnel.id]: true }));
      setFunnelStatusError((m) => ({ ...m, [funnel.id]: null }));

      // Optimistic update
      setFunnels((prev) => {
        if (!prev) return prev;
        return prev.map((f) => (f.id === funnel.id ? { ...f, status: nextStatus } : f));
      });

      try {
        const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnel.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to update funnel status");

        const status = (json?.funnel?.status ?? null) as CreditFunnel["status"] | null;
        if (status && (status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED")) {
          setFunnels((prev) => {
            if (!prev) return prev;
            return prev.map((f) => (f.id === funnel.id ? { ...f, status } : f));
          });
        }

        return true;
      } catch (e) {
        setFunnelStatusError((m) => ({
          ...m,
          [funnel.id]: (e as any)?.message ? String((e as any).message) : "Failed to update funnel status",
        }));
        try {
          await loadFunnels();
        } catch {
          // ignore
        }

        return false;
      } finally {
        setFunnelStatusBusy((m) => ({ ...m, [funnel.id]: false }));
      }
    },
    [funnelStatusBusy, loadFunnels],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadFunnels();
        if (!mounted) return;
        await loadForms();
        if (!mounted) return;
        await loadDomains();
      } catch (e) {
        if (!mounted) return;
        setError((e as any)?.message ? String((e as any).message) : "Failed to load funnel builder data");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadDomains, loadForms, loadFunnels]);

  useEffect(() => {
    if (!creatingKind) return;
    setCreateSlug("");
    setCreateName("");
    setError(null);
  }, [creatingKind]);

  const openCreate = (kind: "funnel" | "form") => {
    setCreatingKind(kind);
  };

  const closeCreate = () => {
    setCreatingKind(null);
    setBusy(false);
    setError(null);
  };

  const submitCreate = async () => {
    if (!creatingKind) return;
    setBusy(true);
    setError(null);

    try {
      const slug = normalizeSlug(createSlug);
      if (!slug) throw new Error("Enter a valid slug (letters, numbers, hyphens)");

      const endpoint = creatingKind === "funnel" ? "/api/portal/funnel-builder/funnels" : "/api/portal/funnel-builder/forms";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, name: createName.trim() || undefined }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Create failed");

      if (creatingKind === "funnel") await loadFunnels();
      else await loadForms();

      closeCreate();
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Create failed");
      setBusy(false);
    }
  };

  const saveDomain = async () => {
    setDomainBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/funnel-builder/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domainInput }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save domain");

      const domainId = typeof json?.domain?.id === "string" ? json.domain.id : "";
      const vercelRecords = extractVercelVerificationRecords(json?.provisioning?.verification);
      if (domainId && vercelRecords.length) {
        setDomainVercelVerificationById((m) => ({ ...m, [domainId]: vercelRecords }));
      }

      setDomainInput("");
      await loadDomains();
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save domain");
    } finally {
      setDomainBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PortalBackToOnboardingLink />
      <AppConfirmModal
        open={deleteDialog?.type === "funnel"}
        title="Delete funnel"
        message={
          pendingDeleteFunnel
            ? `Delete funnel “${pendingDeleteFunnel.name}”? This will remove all pages and cannot be undone.`
            : "Delete this funnel?"
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          const f = pendingDeleteFunnel;
          setDeleteDialog(null);
          if (!f) return;
          void deleteFunnel(f);
        }}
      />

      <AppConfirmModal
        open={deleteDialog?.type === "form"}
        title="Delete form"
        message={
          pendingDeleteForm
            ? `Delete form “${pendingDeleteForm.name}”? This will remove all submissions and cannot be undone.`
            : "Delete this form?"
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          const f = pendingDeleteForm;
          setDeleteDialog(null);
          if (!f) return;
          void deleteForm(f);
        }}
      />

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Funnel Builder</h1>
          <p className="mt-1 text-sm text-zinc-600">Convert more traffic into leads and booked calls.</p>
        </div>
      </div>

      <div className="mt-6 flex w-full flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("funnels")}
          aria-current={tab === "funnels" ? "page" : undefined}
          className={
            "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "funnels"
              ? "border-brand-blue bg-brand-blue text-white shadow-sm focus-visible:ring-brand-blue/40"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Active Funnels
        </button>
        <button
          type="button"
          onClick={() => setTab("forms")}
          aria-current={tab === "forms" ? "page" : undefined}
          className={
            "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "forms"
              ? "border-brand-pink bg-brand-pink text-white shadow-sm focus-visible:ring-brand-pink/40"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Forms
        </button>
        <button
          type="button"
          onClick={() => setTab("settings")}
          aria-current={tab === "settings" ? "page" : undefined}
          className={
            "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "settings"
              ? "border-brand-ink bg-brand-ink text-white shadow-sm focus-visible:ring-brand-ink/40"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Settings
        </button>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {tab === "funnels" ? (
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => openCreate("funnel")}
              className="group flex min-h-[160px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-300 bg-white p-6 text-left hover:bg-zinc-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-xl font-bold text-zinc-700">
                +
              </div>
              <div className="mt-3 text-base font-semibold text-brand-ink">Create a funnel</div>
              <div className="mt-1 text-sm text-zinc-600">Choose a URL slug and start building.</div>
            </button>

            {(funnels || []).map((f) => {
              const assignedDomainClean = String(f.assignedDomain || "").trim().toLowerCase();
              const assignedDomainStatus = getAssignedDomainStatus(assignedDomainClean);
              const hasVerifiedCustomDomain = assignedDomainClean && assignedDomainStatus === "VERIFIED";
              const liveHrefRaw = hasVerifiedCustomDomain
                ? getFunnelLiveHref(f.assignedDomain, f.slug, f.id)
                : assignedDomainClean
                  ? null
                  : getFunnelLiveHref(null, f.slug, f.id);
              const liveHref = f.status === "ACTIVE" ? liveHrefRaw : null;
              const liveUrlLabel = assignedDomainClean ? "Custom domain URL" : "Hosted URL";

              return (
                <div key={f.id} className="rounded-3xl border border-zinc-200 bg-white p-6">
                  <div className="text-base font-semibold text-brand-ink">{f.name}</div>
                  <div className="mt-1 text-sm text-zinc-600">/{f.slug}</div>

                <div className="mt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Domain</div>
                  <div className="mt-1 flex flex-col gap-2">
                    <PortalListboxDropdown
                      value={String(f.assignedDomain || "")}
                      disabled={!!funnelDomainBusy[f.id] || !domains}
                      options={funnelDomainOptions}
                      onChange={(v) => patchFunnelDomain(f, v ? v : null)}
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
                      placeholder="Default (not assigned)"
                    />

                    <div className="text-xs text-zinc-600">
                      {liveUrlLabel}:{" "}
                      <span className={classNames("font-mono", assignedDomainClean && assignedDomainStatus !== "VERIFIED" ? "text-zinc-400" : "text-zinc-700")}>
                        {assignedDomainClean
                          ? isLocalPreview
                            ? `${platformTargetHost || ""}/domain-router/${assignedDomainClean}/${f.slug}`
                            : `https://${assignedDomainClean}/${f.slug}`
                          : `${platformTargetHost || ""}${hostedFunnelPath(f.slug, f.id) || ""}`}
                      </span>
                      {assignedDomainClean && assignedDomainStatus !== "VERIFIED" ? (
                        <span
                          className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                          title="This domain isn’t verified yet (DNS not pointing here or still propagating)."
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                          Pending DNS
                        </span>
                      ) : null}
                    </div>

                    {funnelDomainError[f.id] ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        {funnelDomainError[f.id]}
                      </div>
                    ) : null}
                  </div>
                </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    {(() => {
                      const label = funnelStatusLabel(f, assignedDomainStatus);
                      return (
                        <span
                          className={classNames(
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                            statusPillClass(label),
                          )}
                        >
                          {label}
                        </span>
                      );
                    })()}
                    <div className="relative">
                      <div
                        ref={openFunnelMenuId === f.id ? funnelMenuRootRef : undefined}
                        className="relative"
                      >
                        <button
                          type="button"
                          aria-label="Funnel actions"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenFunnelMenuId((prev) => (prev === f.id ? null : f.id));
                          }}
                          className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        >
                          <DotsIcon className="h-5 w-5" />
                        </button>

                        {openFunnelMenuId === f.id ? (
                          <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
                            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Actions
                            </div>

                            <div className="px-2 pb-2">
                              <Link
                                href={`${basePath}/app/services/funnel-builder/funnels/${encodeURIComponent(f.id)}/edit`}
                                target="_blank"
                                className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                                onClick={() => setOpenFunnelMenuId(null)}
                              >
                                Edit
                              </Link>

                              <Link
                                href={toPurelyHostedUrl(hostedFunnelPath(f.slug, f.id) || `/f/${encodeURIComponent(f.slug)}`)}
                                target="_blank"
                                className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-[color:var(--color-brand-blue)] hover:bg-zinc-50"
                                onClick={() => setOpenFunnelMenuId(null)}
                              >
                                Preview
                              </Link>

                              {liveHref ? (
                                <Link
                                  href={liveHref}
                                  target="_blank"
                                  className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-[color:var(--color-brand-blue)] hover:bg-zinc-50"
                                  onClick={() => setOpenFunnelMenuId(null)}
                                >
                                  Live
                                </Link>
                              ) : (
                                <div
                                  className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-zinc-400"
                                  title={
                                    f.status !== "ACTIVE"
                                      ? "Set this funnel to Live to enable the live link."
                                      : assignedDomainClean
                                        ? "This domain is pending DNS verification. Verify DNS to enable the Live link."
                                        : "Live link is currently unavailable."
                                  }
                                >
                                  Live
                                </div>
                              )}

                              <div className="my-2 h-px bg-zinc-100" />

                              {f.status !== "ARCHIVED" ? (
                                <button
                                  type="button"
                                  disabled={!!funnelStatusBusy[f.id]}
                                  onClick={() => {
                                    const next = f.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
                                    void (async () => {
                                      const ok = await patchFunnelStatus(f, next);
                                      if (ok) setOpenFunnelMenuId(null);
                                    })();
                                  }}
                                  className={classNames(
                                    "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-zinc-50",
                                    f.status === "ACTIVE" ? "text-zinc-700" : "text-green-700",
                                    funnelStatusBusy[f.id] ? "opacity-60" : "",
                                  )}
                                >
                                  {f.status === "ACTIVE" ? "Set status: Draft" : "Set status: Live"}
                                </button>
                              ) : (
                                <div className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-zinc-400">
                                  Status: Archived
                                </div>
                              )}

                              {funnelStatusError[f.id] ? (
                                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                                  {funnelStatusError[f.id]}
                                </div>
                              ) : null}

                              <div className="my-2 h-px bg-zinc-100" />

                              <button
                                type="button"
                                disabled={!!funnelDeleteBusy[f.id]}
                                onClick={() => {
                                  if (funnelDeleteBusy[f.id]) return;
                                  setDeleteDialog({ type: "funnel", id: f.id });
                                  setOpenFunnelMenuId(null);
                                }}
                                className={classNames(
                                  "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-zinc-50",
                                  funnelDeleteBusy[f.id] ? "opacity-60" : "",
                                )}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {funnels === null ? (
            <div className="mt-6 text-sm text-zinc-600">Loading funnels…</div>
          ) : funnels.length === 0 ? (
            <div className="mt-6 text-sm text-zinc-600">No funnels yet. Click the plus card to create one.</div>
          ) : null}
        </section>
      ) : null}

      {tab === "forms" ? (
        <section className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => openCreate("form")}
              className="group flex min-h-[160px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-300 bg-white p-6 text-left hover:bg-zinc-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-xl font-bold text-zinc-700">
                +
              </div>
              <div className="mt-3 text-base font-semibold text-brand-ink">Create a form</div>
              <div className="mt-1 text-sm text-zinc-600">Host forms and collect submissions.</div>
            </button>

            {(forms || []).map((f) => (
              <div key={f.id} className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-base font-semibold text-brand-ink">{f.name}</div>
                <div className="mt-1 text-sm text-zinc-600">/{f.slug}</div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  {(() => {
                    const label = f.status === "ACTIVE" ? "LIVE" : f.status === "ARCHIVED" ? "ARCHIVED" : "DRAFT";
                    return (
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                          statusPillClass(label),
                        )}
                      >
                        {label}
                      </span>
                    );
                  })()}
                  <div className="relative">
                    <div ref={openFormMenuId === f.id ? formMenuRootRef : undefined} className="relative">
                      <button
                        type="button"
                        aria-label="Form actions"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenFormMenuId((prev) => (prev === f.id ? null : f.id));
                        }}
                        className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      >
                        <DotsIcon className="h-5 w-5" />
                      </button>

                      {openFormMenuId === f.id ? (
                        <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
                          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Actions</div>
                          <div className="px-2 pb-2">
                            <Link
                              href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/edit`}
                              target="_blank"
                              className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                              onClick={() => setOpenFormMenuId(null)}
                            >
                              Edit
                            </Link>
                            <Link
                              href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/responses`}
                              target="_blank"
                              className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                              onClick={() => setOpenFormMenuId(null)}
                            >
                              Responses
                            </Link>
                            <Link
                                href={getFormLiveHref(f.slug, f.id) || toPurelyHostedUrl(`/forms/${encodeURIComponent(f.slug)}`)}
                              target="_blank"
                              className="flex w-full items-center rounded-xl px-3 py-2 text-sm font-semibold text-[color:var(--color-brand-blue)] hover:bg-zinc-50"
                              onClick={() => setOpenFormMenuId(null)}
                            >
                              Preview
                            </Link>

                            <div className="my-2 h-px bg-zinc-100" />

                            <button
                              type="button"
                              disabled={!!formDeleteBusy[f.id]}
                              onClick={() => {
                                if (formDeleteBusy[f.id]) return;
                                setDeleteDialog({ type: "form", id: f.id });
                                setOpenFormMenuId(null);
                              }}
                              className={classNames(
                                "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-zinc-50",
                                formDeleteBusy[f.id] ? "opacity-60" : "",
                              )}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {forms === null ? (
            <div className="mt-6 text-sm text-zinc-600">Loading forms…</div>
          ) : forms.length === 0 ? (
            <div className="mt-6 text-sm text-zinc-600">No forms yet. Click the plus card to create one.</div>
          ) : null}
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="mt-6">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Payments (Stripe)</div>
            <p className="mt-1 text-sm text-zinc-600">Connect Stripe to use the Checkout block and sell inside funnels.</p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-700">
                {stripeStatusBusy ? (
                  <span className="text-zinc-500">Checking Stripe status…</span>
                ) : stripeStatus?.configured ? (
                  <span>
                    Connected
                    {stripeStatus.accountId ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        Account: <span className="font-mono text-zinc-800">{stripeStatus.accountId}</span>
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-zinc-500">Not connected</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`${basePath}/app/profile`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Stripe settings
                </Link>
                {!stripeStatusBusy && !stripeStatus?.configured ? (
                  <Link
                    href={`${basePath}/app/profile`}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                  >
                    Connect Stripe
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Custom domains</div>
            <p className="mt-1 text-sm text-zinc-600">
              Save the domain you want to use for funnels/forms. DNS verification + automatic provisioning is the next step.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="example.com"
                className="w-full flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
              <button
                type="button"
                disabled={domainBusy}
                onClick={saveDomain}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                  domainBusy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                )}
              >
                {domainBusy ? "Saving…" : "Save"}
              </button>
            </div>

            <div className="mt-5">
              {domains === null ? (
                <div className="text-sm text-zinc-600">Loading domains…</div>
              ) : domains.length === 0 ? (
                <div className="text-sm text-zinc-600">No domains saved yet.</div>
              ) : (
                <div className="space-y-2">
                  {domains.map((d) => (
                    <div key={d.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{d.domain}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                          <div>
                            Status: {d.status}
                            {d.verifiedAt ? ` · Verified ${new Date(d.verifiedAt).toLocaleDateString()}` : ""}
                          </div>
                          <button
                            type="button"
                            disabled={!!domainVerifyBusy[d.id]}
                            onClick={() => verifyDomain(d)}
                            className={classNames(
                              "rounded-full border px-3 py-1 text-xs font-semibold",
                              domainVerifyBusy[d.id]
                                ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            {domainVerifyBusy[d.id] ? "Verifying…" : d.status === "VERIFIED" ? "Re-check DNS" : "Verify DNS"}
                          </button>
                        </div>

                        {domainVerifyError[d.id] ? (
                          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                            {domainVerifyError[d.id]}
                          </div>
                        ) : null}

                        {(domainVercelVerificationById[d.id] || []).length ? (
                          <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hosting verification records</div>
                            <div className="mt-1 text-xs text-zinc-600">
                              Some domains require a TXT verification record before SSL can be issued. Add these in your DNS provider, then click <span className="font-semibold">Verify DNS</span>.
                            </div>
                            <div className="mt-2 overflow-auto">
                              <table className="w-full min-w-[560px] border-separate border-spacing-0">
                                <thead>
                                  <tr>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Type</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Host / Name</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {domainVercelVerificationById[d.id].map((r, idx) => {
                                    const host = deriveVerificationHostLabels(r.host, d.domain);
                                    const displayHost = host.display || r.host;
                                    const showFull = host.full && host.full !== displayHost;
                                    return (
                                      <tr key={`${r.type}:${r.host}:${idx}`}>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <span className="font-semibold text-zinc-900">{r.type}</span>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="flex flex-col gap-1">
                                            <div className="inline-flex items-center gap-2">
                                              <span className="font-mono text-zinc-800">{displayHost}</span>
                                              <button
                                                type="button"
                                                onClick={() => copyText(displayHost)}
                                                className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                                aria-label="Copy host/name"
                                                title="Copy"
                                              >
                                                <CopyIcon className="h-4 w-4" />
                                              </button>
                                              {showFull ? (
                                                <button
                                                  type="button"
                                                  onClick={() => copyText(host.full)}
                                                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                                  aria-label="Copy full host/name"
                                                  title="Copy full host"
                                                >
                                                  Copy full
                                                </button>
                                              ) : null}
                                            </div>
                                            {showFull ? <div className="font-mono text-[10px] text-zinc-500">Full: {host.full}</div> : null}
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">{r.value}</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText(r.value)}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy value"
                                              title="Copy"
                                            >
                                              <CopyIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Root / behavior</div>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <PortalListboxDropdown<RootMode>
                              value={(d.rootMode || "DIRECTORY") as RootMode}
                              disabled={!!domainSettingsBusy[d.id]}
                              options={[
                                { value: "DIRECTORY", label: "Show directory page" },
                                {
                                  value: "REDIRECT",
                                  label: "Redirect / to a funnel",
                                  disabled: !!funnels && funnels.length === 0,
                                },
                                { value: "DISABLED", label: "Disable / (404)" },
                              ]}
                              onChange={(nextMode) => {
                                if (nextMode === "REDIRECT") {
                                  const eligibleFunnels = (funnels || []).filter((f) => {
                                    const assigned = (f.assignedDomain || "").trim().toLowerCase();
                                    if (!assigned) return true;
                                    return assigned === d.domain;
                                  });
                                  const fallbackSlug =
                                    eligibleFunnels.find((f) => f.status === "ACTIVE")?.slug || eligibleFunnels[0]?.slug || null;
                                  patchDomainSettings(d, { rootMode: "REDIRECT", rootFunnelSlug: d.rootFunnelSlug || fallbackSlug });
                                  return;
                                }
                                patchDomainSettings(d, { rootMode: nextMode, rootFunnelSlug: null });
                              }}
                              buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 sm:w-[240px]"
                            />

                            {(d.rootMode || "DIRECTORY") === "REDIRECT" ? (
                              <PortalListboxDropdown
                                value={String(d.rootFunnelSlug || "")}
                                disabled={!!domainSettingsBusy[d.id] || !funnels || funnels.length === 0}
                                options={[
                                  { value: "", label: "Select a funnel…", disabled: true },
                                  ...(funnels || [])
                                    .filter((f) => {
                                      const assigned = (f.assignedDomain || "").trim().toLowerCase();
                                      if (!assigned) return true;
                                      return assigned === d.domain;
                                    })
                                    .map((f) => ({ value: f.slug, label: `${f.name} (/${f.slug})` })),
                                ]}
                                onChange={(v) => {
                                  const slug = normalizeSlug(String(v || ""));
                                  patchDomainSettings(d, { rootMode: "REDIRECT", rootFunnelSlug: slug || null });
                                }}
                                buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
                                placeholder="Select a funnel…"
                              />
                            ) : null}
                          </div>

                          {domainSettingsError[d.id] ? (
                            <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                              {domainSettingsError[d.id]}
                            </div>
                          ) : null}

                          <div className="mt-2 text-xs text-zinc-600">
                            Requests to <span className="font-mono">https://{d.domain}/</span> follow this rule.
                            Funnel slugs work at <span className="font-mono">/{"{slug}"}</span> and <span className="font-mono">/f/{"{slug}"}</span> for funnels assigned to this domain.
                          </div>
                        </div>

                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">DNS records to add</div>
                          {isLikelyApexDomain(d.domain) ? (
                            <div className="mt-1 text-xs text-zinc-600">
                              For the root (<span className="font-mono">@</span>), use <span className="font-semibold">either</span> an <span className="font-semibold">ALIAS/ANAME</span> <span className="font-semibold">or</span> an <span className="font-semibold">A record</span>.
                            </div>
                          ) : null}
                          {platformTargetHost ? (
                            <div className="mt-2 overflow-auto">
                              <table className="w-full min-w-[520px] border-separate border-spacing-0">
                                <thead>
                                  <tr>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Type</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Host / Name</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {!isLikelyApexDomain(d.domain) ? (
                                    <tr>
                                      <td className="border-b border-zinc-100 py-2 text-xs">
                                        <span className="font-semibold text-zinc-900">CNAME</span>
                                      </td>
                                      <td className="border-b border-zinc-100 py-2 text-xs">
                                        <div className="inline-flex items-center gap-2">
                                          <span className="font-mono text-zinc-800">{deriveDnsHostLabel(d.domain)}</span>
                                          <button
                                            type="button"
                                            onClick={() => copyText(deriveDnsHostLabel(d.domain))}
                                            className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                            aria-label="Copy host/name"
                                            title="Copy"
                                          >
                                            <CopyIcon className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="border-b border-zinc-100 py-2 text-xs">
                                        <div className="inline-flex items-center gap-2">
                                          <span className="font-mono text-zinc-800">{platformTargetHost}</span>
                                          <button
                                            type="button"
                                            onClick={() => copyText(platformTargetHost)}
                                            className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                            aria-label="Copy value"
                                            title="Copy"
                                          >
                                            <CopyIcon className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ) : (
                                    <>
                                      <tr>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <span className="font-semibold text-zinc-900">ALIAS / ANAME</span>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">@</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText("@")}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy host/name"
                                              title="Copy"
                                            >
                                              <CopyIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">{platformTargetHost}</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText(platformTargetHost)}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy value"
                                              title="Copy"
                                            >
                                              <CopyIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="flex items-baseline gap-1">
                                            <span className="font-semibold text-zinc-900">A</span>
                                            <span className="text-[10px] font-semibold text-zinc-500">record (alternative)</span>
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">@</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText("@")}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy host/name"
                                              title="Copy"
                                            >
                                              <CopyIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">76.76.21.21</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText("76.76.21.21")}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy value"
                                              title="Copy"
                                            >
                                              <CopyIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <span className="font-semibold text-zinc-900">CNAME</span>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">www</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText("www")}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy host/name"
                                              title="Copy"
                                            >
                                              <CopyIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </td>
                                        <td className="border-b border-zinc-100 py-2 text-xs">
                                          <div className="inline-flex items-center gap-2">
                                            <span className="font-mono text-zinc-800">{platformTargetHost}</span>
                                            <button
                                              type="button"
                                              onClick={() => copyText(platformTargetHost)}
                                              className="rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                              aria-label="Copy value"
                                              title="Copy"
                                            >
                                              <CopyIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    </>
                                  )}
                                </tbody>
                              </table>

                              <div className="mt-2 text-xs text-zinc-600">
                                Use the exact <span className="font-semibold">Type</span>, <span className="font-semibold">Host/Name</span>, and <span className="font-semibold">Value</span> fields in your DNS provider. When it asks for the record type, choose an <span className="font-semibold">A record</span> (shown as <span className="font-mono">A</span>) or a <span className="font-semibold">CNAME</span> record as indicated.
                                If your provider does not support <span className="font-semibold">ALIAS/ANAME</span> at <span className="font-mono">@</span>, use the <span className="font-mono">www</span> record and set your root domain to forward to <span className="font-mono">www</span>.
                                After saving your DNS changes, click <span className="font-semibold">Verify DNS</span> above to re-check.
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-zinc-600">Loading DNS target…</div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-zinc-600">
                        Add the required DNS record(s) for this domain in your DNS provider (Type, Host/Name, Value). DNS changes can take time to propagate.
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {creatingKind ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]">
          <div className="w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="text-lg font-bold text-brand-ink">
              {creatingKind === "funnel" ? "Create funnel" : "Create form"}
            </div>
            <p className="mt-1 text-sm text-zinc-600">Choose a URL slug. You can rename it later.</p>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
                <input
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  placeholder={creatingKind === "funnel" ? "credit-repair" : "intake"}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                />
                <div className="mt-1 text-xs text-zinc-500">
                  URL: {creatingKind === "funnel" ? funnelPreviewBase : formPreviewBase}/<span className="font-semibold">{normalizeSlug(createSlug) || "…"}</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name (optional)</div>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={creatingKind === "funnel" ? "Credit Repair Funnel" : "Client Intake Form"}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                />
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCreate}
                disabled={busy}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={busy}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                  busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:opacity-95",
                )}
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
