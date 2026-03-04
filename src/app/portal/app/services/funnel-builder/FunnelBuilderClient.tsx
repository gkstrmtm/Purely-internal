"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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

type TabKey = "funnels" | "forms" | "settings";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (raw) {
    try {
      return new URL(raw).hostname || null;
    } catch {
      // ignore
    }
  }
  if (typeof window !== "undefined") return window.location.hostname || null;
  return null;
}

export function FunnelBuilderClient() {
  const pathname = usePathname();
  const basePath = pathname === "/credit" || pathname.startsWith("/credit/") ? "/credit" : "/portal";

  const [tab, setTab] = useState<TabKey>("funnels");

  const [funnels, setFunnels] = useState<CreditFunnel[] | null>(null);
  const [forms, setForms] = useState<CreditForm[] | null>(null);
  const [domains, setDomains] = useState<CreditDomain[] | null>(null);

  const [creatingKind, setCreatingKind] = useState<"funnel" | "form" | null>(null);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domainInput, setDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainSettingsBusy, setDomainSettingsBusy] = useState<Record<string, boolean>>({});
  const [domainSettingsError, setDomainSettingsError] = useState<Record<string, string | null>>({});

  const [funnelDomainBusy, setFunnelDomainBusy] = useState<Record<string, boolean>>({});
  const [funnelDomainError, setFunnelDomainError] = useState<Record<string, string | null>>({});

  const funnelPreviewBase = useMemo(() => `${basePath}/f`, [basePath]);
  const formPreviewBase = useMemo(() => `${basePath}/forms`, [basePath]);
  const platformTargetHost = useMemo(() => coercePlatformTargetHost(), []);
  const isLocalPreview = useMemo(() => {
    const h = (platformTargetHost || "").trim().toLowerCase();
    return h === "localhost" || h.endsWith(".local") || h === "127.0.0.1";
  }, [platformTargetHost]);

  const getFunnelLiveHref = useCallback(
    (domain: string, slug: string) => {
      const cleanDomain = String(domain || "").trim().toLowerCase();
      const cleanSlug = String(slug || "").trim();
      if (!cleanDomain || !cleanSlug) return null;
      if (isLocalPreview) return `/domain-router/${encodeURIComponent(cleanDomain)}/${encodeURIComponent(cleanSlug)}`;
      return `https://${cleanDomain}/${encodeURIComponent(cleanSlug)}`;
    },
    [isLocalPreview],
  );

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
        return prev.map((f) => (f.id === funnel.id ? { ...f, assignedDomain: nextDomain } : f));
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

        setFunnels((prev) => {
          if (!prev) return prev;
          return prev.map((f) => (f.id === funnel.id ? { ...f, assignedDomain: assigned } : f));
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
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Funnel Builder</h1>
          <p className="mt-1 text-sm text-zinc-600">Convert more traffic into leads and booked calls.</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("funnels")}
          className={classNames(
            "rounded-full px-4 py-2 text-sm font-semibold",
            tab === "funnels" ? "bg-brand-ink text-white" : "border border-zinc-200 bg-white text-brand-ink hover:bg-zinc-50",
          )}
        >
          Active Funnels
        </button>
        <button
          type="button"
          onClick={() => setTab("forms")}
          className={classNames(
            "rounded-full px-4 py-2 text-sm font-semibold",
            tab === "forms" ? "bg-brand-ink text-white" : "border border-zinc-200 bg-white text-brand-ink hover:bg-zinc-50",
          )}
        >
          Forms
        </button>
        <button
          type="button"
          onClick={() => setTab("settings")}
          className={classNames(
            "rounded-full px-4 py-2 text-sm font-semibold",
            tab === "settings" ? "bg-brand-ink text-white" : "border border-zinc-200 bg-white text-brand-ink hover:bg-zinc-50",
          )}
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

            {(funnels || []).map((f) => (
              <div key={f.id} className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-base font-semibold text-brand-ink">{f.name}</div>
                <div className="mt-1 text-sm text-zinc-600">/{f.slug}</div>

                <div className="mt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Domain</div>
                  <div className="mt-1 flex flex-col gap-2">
                    <select
                      value={(f.assignedDomain || "") as any}
                      disabled={!!funnelDomainBusy[f.id] || !domains}
                      onChange={(e) => {
                        const v = String(e.target.value || "").trim();
                        patchFunnelDomain(f, v ? v : null);
                      }}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                    >
                      <option value="">Default (not assigned)</option>
                      {(domains || []).map((d) => (
                        <option key={d.id} value={d.domain}>
                          {d.domain}{d.status === "PENDING" ? " (pending)" : ""}
                        </option>
                      ))}
                    </select>

                    {f.assignedDomain ? (
                      <div className="text-xs text-zinc-600">
                        Live URL:{" "}
                        <span className="font-mono">
                          {isLocalPreview ? `${platformTargetHost || ""}/domain-router/${f.assignedDomain}/${f.slug}` : `https://${f.assignedDomain}/${f.slug}`}
                        </span>
                      </div>
                    ) : null}

                    {funnelDomainError[f.id] ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        {funnelDomainError[f.id]}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                    {f.status}
                  </span>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`${basePath}/app/services/funnel-builder/funnels/${encodeURIComponent(f.id)}/edit`}
                      target="_blank"
                      className="text-sm font-semibold text-brand-ink hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`${funnelPreviewBase}/${encodeURIComponent(f.slug)}`}
                      target="_blank"
                      className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                    >
                      Preview
                    </Link>

                    {f.assignedDomain ? (
                      <Link
                        href={getFunnelLiveHref(f.assignedDomain, f.slug) || `${funnelPreviewBase}/${encodeURIComponent(f.slug)}`}
                        target="_blank"
                        className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                      >
                        Live
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
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
                  <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                    {f.status}
                  </span>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/edit`}
                      target="_blank"
                      className="text-sm font-semibold text-brand-ink hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/responses`}
                      target="_blank"
                      className="text-sm font-semibold text-brand-ink hover:underline"
                    >
                      Responses
                    </Link>
                    <Link
                      href={`${formPreviewBase}/${encodeURIComponent(f.slug)}`}
                      target="_blank"
                      className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                    >
                      Preview
                    </Link>
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
                        <div className="mt-1 text-xs text-zinc-600">
                          Status: {d.status}{d.verifiedAt ? ` · Verified ${new Date(d.verifiedAt).toLocaleDateString()}` : ""}
                        </div>

                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Root / behavior</div>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <select
                              value={(d.rootMode || "DIRECTORY") as any}
                              disabled={!!domainSettingsBusy[d.id]}
                              onChange={(e) => {
                                const nextMode = String(e.target.value) as any;
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
                              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 sm:w-[240px]"
                            >
                              <option value="DIRECTORY">Show directory page</option>
                              <option value="REDIRECT" disabled={!!funnels && funnels.length === 0}>
                                Redirect / to a funnel
                              </option>
                              <option value="DISABLED">Disable / (404)</option>
                            </select>

                            {(d.rootMode || "DIRECTORY") === "REDIRECT" ? (
                              <select
                                value={d.rootFunnelSlug || ""}
                                disabled={!!domainSettingsBusy[d.id] || !funnels || funnels.length === 0}
                                onChange={(e) => {
                                  const slug = normalizeSlug(String(e.target.value || ""));
                                  patchDomainSettings(d, { rootMode: "REDIRECT", rootFunnelSlug: slug || null });
                                }}
                                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                              >
                                <option value="" disabled>
                                  Select a funnel…
                                </option>
                                {(funnels || [])
                                  .filter((f) => {
                                    const assigned = (f.assignedDomain || "").trim().toLowerCase();
                                    if (!assigned) return true;
                                    return assigned === d.domain;
                                  })
                                  .map((f) => (
                                    <option key={f.id} value={f.slug}>
                                      {f.name} (/{f.slug})
                                    </option>
                                  ))}
                              </select>
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
                          {platformTargetHost ? (
                            <div className="mt-2 overflow-auto">
                              <table className="w-full min-w-[520px] border-separate border-spacing-0">
                                <thead>
                                  <tr>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Type</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Host / Name</th>
                                    <th className="border-b border-zinc-200 pb-2 text-left text-xs font-semibold text-zinc-600">Value</th>
                                    <th className="border-b border-zinc-200 pb-2 text-right text-xs font-semibold text-zinc-600">Copy</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {!isLikelyApexDomain(d.domain) ? (
                                    <tr>
                                      <td className="border-b border-zinc-100 py-2 text-xs font-semibold text-zinc-900">CNAME</td>
                                      <td className="border-b border-zinc-100 py-2 text-xs font-mono text-zinc-800">
                                        {deriveDnsHostLabel(d.domain)}
                                      </td>
                                      <td className="border-b border-zinc-100 py-2 text-xs font-mono text-zinc-800">{platformTargetHost}</td>
                                      <td className="border-b border-zinc-100 py-2 text-right">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const text = `Type: CNAME\nHost: ${deriveDnsHostLabel(d.domain)}\nValue: ${platformTargetHost}`;
                                            await navigator.clipboard.writeText(text);
                                          }}
                                          className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                        >
                                          Copy
                                        </button>
                                      </td>
                                    </tr>
                                  ) : (
                                    <>
                                      <tr>
                                        <td className="border-b border-zinc-100 py-2 text-xs font-semibold text-zinc-900">ALIAS / ANAME</td>
                                        <td className="border-b border-zinc-100 py-2 text-xs font-mono text-zinc-800">@</td>
                                        <td className="border-b border-zinc-100 py-2 text-xs font-mono text-zinc-800">{platformTargetHost}</td>
                                        <td className="border-b border-zinc-100 py-2 text-right">
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              const text = `Type: ALIAS/ANAME\nHost: @\nValue: ${platformTargetHost}`;
                                              await navigator.clipboard.writeText(text);
                                            }}
                                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          >
                                            Copy
                                          </button>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="border-b border-zinc-100 py-2 text-xs font-semibold text-zinc-900">CNAME</td>
                                        <td className="border-b border-zinc-100 py-2 text-xs font-mono text-zinc-800">www</td>
                                        <td className="border-b border-zinc-100 py-2 text-xs font-mono text-zinc-800">{platformTargetHost}</td>
                                        <td className="border-b border-zinc-100 py-2 text-right">
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              const text = `Type: CNAME\nHost: www\nValue: ${platformTargetHost}`;
                                              await navigator.clipboard.writeText(text);
                                            }}
                                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          >
                                            Copy
                                          </button>
                                        </td>
                                      </tr>
                                    </>
                                  )}
                                </tbody>
                              </table>

                              <div className="mt-2 text-xs text-zinc-600">
                                Use the exact <span className="font-semibold">Type</span>, <span className="font-semibold">Host/Name</span>, and <span className="font-semibold">Value</span> fields in your DNS provider.
                                If your provider does not support <span className="font-semibold">ALIAS/ANAME</span> at <span className="font-mono">@</span>, use the <span className="font-mono">www</span> record and set your root domain to forward to <span className="font-mono">www</span>.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
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
