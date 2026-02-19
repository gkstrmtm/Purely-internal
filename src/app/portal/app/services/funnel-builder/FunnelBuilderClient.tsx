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
};

type CreditFunnelBuilderSettings = {
  notifyEmails: string[];
  webhookUrl: string | null;
  webhookSecret: string;
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

export function FunnelBuilderClient() {
  const pathname = usePathname();
  const basePath = pathname === "/credit" || pathname.startsWith("/credit/") ? "/credit" : "/portal";

  const [tab, setTab] = useState<TabKey>("funnels");

  const [funnels, setFunnels] = useState<CreditFunnel[] | null>(null);
  const [forms, setForms] = useState<CreditForm[] | null>(null);
  const [domains, setDomains] = useState<CreditDomain[] | null>(null);
  const [settings, setSettings] = useState<CreditFunnelBuilderSettings | null>(null);

  const [creatingKind, setCreatingKind] = useState<"funnel" | "form" | null>(null);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domainInput, setDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);

  const [notifyEmailsInput, setNotifyEmailsInput] = useState("");
  const [webhookUrlInput, setWebhookUrlInput] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);

  const funnelPreviewBase = useMemo(() => `${basePath}/f`, [basePath]);
  const formPreviewBase = useMemo(() => `${basePath}/forms`, [basePath]);

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

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/portal/funnel-builder/settings", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load settings");
    setSettings(json.settings as CreditFunnelBuilderSettings);
    const emails = Array.isArray(json.settings?.notifyEmails) ? json.settings.notifyEmails : [];
    setNotifyEmailsInput(emails.join(", "));
    setWebhookUrlInput(typeof json.settings?.webhookUrl === "string" ? json.settings.webhookUrl : "");
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadFunnels();
        if (!mounted) return;
        await loadForms();
        if (!mounted) return;
        await loadDomains();
        if (!mounted) return;
        await loadSettings();
      } catch (e) {
        if (!mounted) return;
        setError((e as any)?.message ? String((e as any).message) : "Failed to load funnel builder data");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadDomains, loadForms, loadFunnels, loadSettings]);

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

  const saveSettings = async (opts?: { regenerateSecret?: boolean }) => {
    setSettingsBusy(true);
    setError(null);
    try {
      const notifyEmails = notifyEmailsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const webhookUrl = webhookUrlInput.trim() || null;
      const res = await fetch("/api/portal/funnel-builder/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notifyEmails, webhookUrl, regenerateSecret: opts?.regenerateSecret === true }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save settings");
      setSettings(json.settings as CreditFunnelBuilderSettings);
      const emails = Array.isArray(json.settings?.notifyEmails) ? json.settings.notifyEmails : [];
      setNotifyEmailsInput(emails.join(", "));
      setWebhookUrlInput(typeof json.settings?.webhookUrl === "string" ? json.settings.webhookUrl : "");
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save settings");
    } finally {
      setSettingsBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Funnel Builder</h1>
          <p className="mt-1 text-sm text-zinc-600">Build funnels, host forms, and connect domains for your credit portal.</p>
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
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                    {f.status}
                  </span>
                  <Link
                    href={`${funnelPreviewBase}/${encodeURIComponent(f.slug)}`}
                    target="_blank"
                    className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                  >
                    Preview
                  </Link>
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
              <div className="mt-1 text-sm text-zinc-600">Host forms under your credit portal.</div>
            </button>

            {(forms || []).map((f) => (
              <div key={f.id} className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-base font-semibold text-brand-ink">{f.name}</div>
                <div className="mt-1 text-sm text-zinc-600">/{f.slug}</div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                    {f.status}
                  </span>
                  <Link
                    href={`${formPreviewBase}/${encodeURIComponent(f.slug)}`}
                    target="_blank"
                    className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                  >
                    Preview
                  </Link>
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
                      </div>
                      <div className="text-xs text-zinc-600">
                        Add this domain in your Vercel project and follow the DNS instructions it provides.
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Notifications</div>
            <p className="mt-1 text-sm text-zinc-600">
              Get notified when a hosted credit form is submitted. Webhooks are signed with your secret.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Notify emails</div>
                <input
                  value={notifyEmailsInput}
                  onChange={(e) => setNotifyEmailsInput(e.target.value)}
                  placeholder="ops@yourdomain.com, you@yourdomain.com"
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                />
                <div className="mt-1 text-xs text-zinc-500">Comma-separated. Max 10.</div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Webhook URL</div>
                <input
                  value={webhookUrlInput}
                  onChange={(e) => setWebhookUrlInput(e.target.value)}
                  placeholder="https://example.com/webhooks/credit"
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                />
                <div className="mt-1 text-xs text-zinc-500">Optional. Uses header `x-pa-signature` (HMAC-SHA256).</div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-zinc-600">
                Secret: <span className="font-mono">{settings?.webhookSecret ? `${settings.webhookSecret.slice(0, 6)}…` : "…"}</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={settingsBusy}
                  onClick={() => saveSettings({ regenerateSecret: true })}
                  className={classNames(
                    "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
                    settingsBusy ? "opacity-60" : "",
                  )}
                >
                  Regenerate secret
                </button>
                <button
                  type="button"
                  disabled={settingsBusy}
                  onClick={() => saveSettings()}
                  className={classNames(
                    "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                    settingsBusy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                  )}
                >
                  {settingsBusy ? "Saving…" : "Save settings"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Hosting notes</div>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              <li>Funnels preview at: <span className="font-semibold">{funnelPreviewBase}/&lt;slug&gt;</span></li>
              <li>Forms preview at: <span className="font-semibold">{formPreviewBase}/&lt;slug&gt;</span></li>
              <li>Domain verification/provisioning UI can be added next (TXT record checks + status polling).</li>
            </ul>
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
