"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";

type AudienceTab = "external" | "internal";

type Site = {
  id: string;
  name: string;
  slug: string | null;
  primaryDomain: string | null;
  verificationToken: string;
  verifiedAt: string | null;
  updatedAt: string;
};

type Settings = {
  enabled: boolean;
  frequencyDays: number;
  cursor: number;
  requireApproval: boolean;
  channels: { email: boolean; sms: boolean };
  topics: string[];
  promptAnswers: Record<string, string>;
  audience: { tagIds: string[]; contactIds: string[]; emails: string[]; userIds: string[] };
  lastGeneratedAt: string | null;
  nextDueAt: string | null;
};

type Tag = { id: string; name: string; color: string | null };

type NewsletterRow = {
  id: string;
  kind: "EXTERNAL" | "INTERNAL";
  status: "DRAFT" | "READY" | "SENT";
  slug: string;
  title: string;
  excerpt: string;
  sentAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
}

function splitLines(value: string): string[] {
  const raw = (value || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 50) break;
  }
  return out;
}

function splitEmails(value: string): string[] {
  const raw = (value || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 200) break;
  }
  return out;
}

export function PortalNewsletterClient({ initialAudience }: { initialAudience: AudienceTab }) {
  const toast = useToast();

  const [audience, setAudience] = useState<AudienceTab>(initialAudience);
  const kind = audience === "internal" ? "INTERNAL" : "EXTERNAL";

  const [site, setSite] = useState<Site | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newsletters, setNewsletters] = useState<NewsletterRow[]>([]);

  const [credits, setCredits] = useState<number | null>(null);
  const [creditsUsed30d, setCreditsUsed30d] = useState<number | null>(null);
  const [generations30d, setGenerations30d] = useState<number | null>(null);
  const [billingPath, setBillingPath] = useState<string>("/portal/app/billing");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const siteHandle = useMemo(() => {
    if (!site) return null;
    return site.slug ?? site.id;
  }, [site]);

  const publicBasePath = useMemo(() => {
    if (!siteHandle) return null;
    return audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`;
  }, [audience, siteHandle]);

  const refresh = useCallback(async () => {
    setLoading(true);

    const [siteRes, settingsRes, tagsRes, creditsRes, usageRes, listRes] = await Promise.all([
      fetch("/api/portal/newsletter/site", { cache: "no-store" }),
      fetch(`/api/portal/newsletter/automation/settings?kind=${audience}`, { cache: "no-store" }),
      fetch("/api/portal/contact-tags", { cache: "no-store" }),
      fetch("/api/portal/credits", { cache: "no-store" }),
      fetch("/api/portal/newsletter/usage?range=30d", { cache: "no-store" }),
      fetch(`/api/portal/newsletter/newsletters?kind=${audience}&take=100`, { cache: "no-store" }),
    ]);

    const siteJson = (await siteRes.json().catch(() => ({}))) as any;
    const settingsJson = (await settingsRes.json().catch(() => ({}))) as any;
    const tagsJson = (await tagsRes.json().catch(() => ({}))) as any;
    const creditsJson = (await creditsRes.json().catch(() => ({}))) as any;
    const usageJson = (await usageRes.json().catch(() => ({}))) as any;
    const listJson = (await listRes.json().catch(() => ({}))) as any;

    if (!siteRes.ok) toast.error(siteJson?.error ?? "Unable to load newsletter site");
    if (!settingsRes.ok) toast.error(settingsJson?.error ?? "Unable to load newsletter settings");
    if (!tagsRes.ok) toast.error(tagsJson?.error ?? "Unable to load contact tags");

    setSite(siteJson?.site ?? null);

    if (settingsRes.ok && settingsJson?.settings) setSettings(settingsJson.settings as Settings);

    setTags(Array.isArray(tagsJson?.tags) ? tagsJson.tags : []);

    if (creditsRes.ok) {
      setCredits(typeof creditsJson?.credits === "number" ? creditsJson.credits : 0);
      setBillingPath(typeof creditsJson?.billingPath === "string" ? creditsJson.billingPath : "/portal/app/billing");
    }

    if (usageRes.ok) {
      setCreditsUsed30d(typeof usageJson?.creditsUsed?.range === "number" ? usageJson.creditsUsed.range : 0);
      setGenerations30d(typeof usageJson?.generations?.range === "number" ? usageJson.generations.range : 0);
    }

    setNewsletters(Array.isArray(listJson?.newsletters) ? (listJson.newsletters as NewsletterRow[]) : []);

    setLoading(false);
  }, [audience, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
    setSaving(true);

    const res = await fetch("/api/portal/newsletter/automation/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: audience,
        enabled: Boolean(settings.enabled),
        frequencyDays: Math.max(1, Math.min(30, Math.floor(Number(settings.frequencyDays) || 7))),
        requireApproval: Boolean(settings.requireApproval),
        channels: settings.channels,
        topics: settings.topics,
        promptAnswers: settings.promptAnswers,
        audience: settings.audience,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) toast.error(json?.error ?? "Failed to save");
    else toast.success("Saved");

    setSaving(false);
    await refresh();
  }, [audience, refresh, settings, toast]);

  const generateNow = useCallback(async () => {
    setGenerating(true);

    const res = await fetch("/api/portal/newsletter/automation/generate-now", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: audience }),
    });

    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      if (json?.error === "INSUFFICIENT_CREDITS") {
        toast.error("Not enough credits. Add credits in Billing.");
      } else {
        toast.error(json?.error ?? "Failed to generate");
      }
      setGenerating(false);
      return;
    }

    toast.success(audience === "internal" ? "Internal newsletter generated" : "Newsletter generated");
    setGenerating(false);
    await refresh();
  }, [audience, refresh, toast]);

  const sendReady = useCallback(async (newsletterId: string) => {
    const ok = window.confirm("Send this newsletter now? This will message your selected audience.");
    if (!ok) return;

    const res = await fetch(`/api/portal/newsletter/newsletters/${newsletterId}/send`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      toast.error(json?.error ?? "Failed to send");
      return;
    }
    toast.success("Sent");
    await refresh();
  }, [refresh, toast]);

  const selectedTagIds = new Set(settings?.audience?.tagIds ?? []);

  const promptFields = useMemo(() => {
    if (audience === "internal") {
      return [
        { key: "updates", label: "What updates should the team know about?" },
        { key: "wins", label: "Any wins/highlights to include?" },
        { key: "issues", label: "Any issues/risks to flag?" },
        { key: "next", label: "What should we do next?" },
      ];
    }
    return [
      { key: "goal", label: "What is the goal of this newsletter?" },
      { key: "audience", label: "Who is this for and what do they care about?" },
      { key: "offer", label: "Any offer/promo (optional)?" },
      { key: "cta", label: "What should they do next?" },
    ];
  }, [audience]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Newsletter</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            AI newsletters cost 1 credit per generation. Send by email and SMS (SMS includes a link to the hosted page).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/portal/app/billing"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {credits === null ? "Credits" : `Credits: ${credits}`}
          </Link>
          <Link
            href={billingPath}
            className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Billing
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAudience("external")}
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition " +
              (audience === "external"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            External (Leads/Customers)
          </button>
          <button
            type="button"
            onClick={() => setAudience("internal")}
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition " +
              (audience === "internal"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            Internal (Team)
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving || !settings}
              className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={generateNow}
              disabled={generating}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate now (1 credit)"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Automation</div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={Boolean(settings?.enabled)}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))}
              />
              <div className="text-sm font-semibold text-zinc-800">Enabled</div>
            </label>

            <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Frequency (days)</div>
              <input
                type="number"
                min={1}
                max={30}
                value={settings?.frequencyDays ?? 7}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, frequencyDays: Math.max(1, Math.min(30, Math.floor(Number(e.target.value) || 7))) } : prev,
                  )
                }
                className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={Boolean(settings?.requireApproval)}
                onChange={(e) => setSettings((prev) => (prev ? { ...prev, requireApproval: e.target.checked } : prev))}
              />
              <div>
                <div className="text-sm font-semibold text-zinc-800">Require approval</div>
                <div className="mt-1 text-xs text-zinc-500">If enabled, scheduled runs create READY drafts you manually send.</div>
              </div>
            </label>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Channels</div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.channels?.email)}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, channels: { ...prev.channels, email: e.target.checked } } : prev))
                    }
                  />
                  Email
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.channels?.sms)}
                    onChange={(e) =>
                      setSettings((prev) => (prev ? { ...prev, channels: { ...prev.channels, sms: e.target.checked } } : prev))
                    }
                  />
                  SMS (link)
                </label>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Last generated</div>
              <div className="mt-2 text-sm text-zinc-800">{formatDate(settings?.lastGeneratedAt ?? null) || "—"}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Next due</div>
              <div className="mt-2 text-sm text-zinc-800">{formatDate(settings?.nextDueAt ?? null) || "—"}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-zinc-900">Guided prompt</div>
            <div className="mt-3 grid gap-3">
              {promptFields.map((f) => (
                <label key={f.key} className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{f.label}</div>
                  <textarea
                    value={settings?.promptAnswers?.[f.key] ?? ""}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, promptAnswers: { ...prev.promptAnswers, [f.key]: e.target.value.slice(0, 2000) } }
                          : prev,
                      )
                    }
                    rows={2}
                    className="mt-2 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder={audience === "internal" ? "Type a few bullets…" : "Type a few sentences…"}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-zinc-900">Topic hints (optional)</div>
            <div className="mt-2 text-sm text-zinc-600">One per line. The generator will rotate through these.</div>
            <textarea
              value={(settings?.topics ?? []).join("\n")}
              onChange={(e) =>
                setSettings((prev) =>
                  prev ? { ...prev, topics: splitLines(e.target.value) } : prev,
                )
              }
              rows={4}
              className="mt-3 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder={audience === "internal" ? "Weekly priorities\nOps changes\nHiring" : "Seasonal maintenance tips\nBefore/after photos\nFAQ"}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Audience</div>
          <div className="mt-2 text-sm text-zinc-600">Select tags to include in the send list.</div>

          <div className="mt-3 max-h-72 space-y-2 overflow-auto rounded-2xl border border-zinc-200 p-3">
            {tags.length ? (
              tags.map((t) => (
                <label key={t.id} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTagIds.has(t.id)}
                    onChange={(e) =>
                      setSettings((prev) => {
                        if (!prev) return prev;
                        const next = new Set(prev.audience.tagIds);
                        if (e.target.checked) next.add(t.id);
                        else next.delete(t.id);
                        return { ...prev, audience: { ...prev.audience, tagIds: Array.from(next) } };
                      })
                    }
                  />
                  <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color || "#a1a1aa" }} />
                  <span className="text-zinc-800">{t.name}</span>
                </label>
              ))
            ) : (
              <div className="text-sm text-zinc-500">No tags yet.</div>
            )}
          </div>

          {audience === "internal" ? (
            <div className="mt-5">
              <div className="text-sm font-semibold text-zinc-900">Extra emails (internal only)</div>
              <div className="mt-2 text-sm text-zinc-600">Comma or newline separated.</div>
              <textarea
                value={(settings?.audience?.emails ?? []).join("\n")}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, audience: { ...prev.audience, emails: splitEmails(e.target.value) } } : prev,
                  )
                }
                rows={4}
                className="mt-3 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="ops@company.com\nmanager@company.com"
              />
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Usage (30d)</div>
            <div className="mt-2 text-sm text-zinc-800">
              {creditsUsed30d === null ? "—" : `${creditsUsed30d} credits used`} · {generations30d === null ? "—" : `${generations30d} generations`}
            </div>
          </div>

          {siteHandle ? (
            <div className="mt-4 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hosted pages</div>
              <div className="mt-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                {typeof window === "undefined" ? `${publicBasePath}` : `${window.location.origin}${publicBasePath}`}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">Configure hosting in Settings once the site is created.</div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Recent newsletters</div>
            <div className="mt-1 text-sm text-zinc-600">READY drafts can be sent manually when approval is required.</div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {newsletters.length ? (
            newsletters.map((n) => {
              const publicPath = siteHandle
                ? `${audience === "internal" ? `/${siteHandle}/internal-newsletters` : `/${siteHandle}/newsletters`}/${n.slug}`
                : null;

              return (
                <div key={n.id} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{n.title || "(untitled)"}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {n.status} · created {formatDate(n.createdAtIso)}{n.sentAtIso ? ` · sent ${formatDate(n.sentAtIso)}` : ""}
                      </div>
                      <div className="mt-2 text-sm text-zinc-600">{n.excerpt}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {publicPath ? (
                        <Link
                          href={publicPath}
                          target="_blank"
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          View hosted
                        </Link>
                      ) : null}

                      {n.status === "READY" ? (
                        <button
                          type="button"
                          onClick={() => void sendReady(n.id)}
                          className="rounded-2xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                        >
                          Send now
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-zinc-600">No newsletters yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
