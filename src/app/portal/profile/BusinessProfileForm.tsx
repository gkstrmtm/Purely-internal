"use client";

import { useEffect, useMemo, useState } from "react";

type BusinessProfile = {
  businessName: string;
  websiteUrl: string | null;
  industry: string | null;
  businessModel: string | null;
  primaryGoals: unknown;
  targetCustomer: string | null;
  brandVoice: string | null;
  updatedAt?: string;
};

type ApiGet = { ok: boolean; profile: BusinessProfile | null };

type ApiPut = { ok: boolean; profile: BusinessProfile };

function goalsToText(goals: unknown) {
  if (!Array.isArray(goals)) return "";
  return goals.filter((g) => typeof g === "string").join(", ");
}

function textToGoals(text: string) {
  const xs = String(text || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return xs.length ? Array.from(new Set(xs)).slice(0, 10) : undefined;
}

export function BusinessProfileForm({
  title,
  description,
  onSaved,
}: {
  title?: string;
  description?: string;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [primaryGoalsText, setPrimaryGoalsText] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [brandVoice, setBrandVoice] = useState("");

  const canSave = useMemo(() => businessName.trim().length >= 2, [businessName]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setError(null);
      const res = await fetch("/api/portal/business-profile", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<ApiGet>;
      if (!mounted) return;

      if (!res.ok) {
        setError((json as { error?: string })?.error ?? "Unable to load business profile");
        setLoading(false);
        return;
      }

      const p = json.profile;
      if (p) {
        setBusinessName(p.businessName ?? "");
        setWebsiteUrl(p.websiteUrl ?? "");
        setIndustry(p.industry ?? "");
        setBusinessModel(p.businessModel ?? "");
        setPrimaryGoalsText(goalsToText(p.primaryGoals));
        setTargetCustomer(p.targetCustomer ?? "");
        setBrandVoice(p.brandVoice ?? "");
      }

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/portal/business-profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessName,
        websiteUrl,
        industry,
        businessModel,
        primaryGoals: textToGoals(primaryGoalsText),
        targetCustomer,
        brandVoice,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as Partial<ApiPut> & { error?: string };
    setSaving(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to save");
      return;
    }

    onSaved?.();
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading business profile…
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6">
      <div className="text-sm font-semibold text-zinc-900">{title ?? "Business profile"}</div>
      <div className="mt-2 text-sm text-zinc-600">
        {description ?? "This helps us tailor services and onboarding to your business."}
      </div>

      {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Business name</label>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Acme Dental"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Website (optional)</label>
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Industry (optional)</label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Home services, dental, legal…"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Business model (optional)</label>
          <input
            value={businessModel}
            onChange={(e) => setBusinessModel(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Appointments, subscriptions, one-time jobs…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Primary goals (optional)</label>
          <input
            value={primaryGoalsText}
            onChange={(e) => setPrimaryGoalsText(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="More leads, fewer no-shows, better SEO"
          />
          <div className="mt-1 text-xs text-zinc-500">Comma-separated is fine.</div>
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Target customer (optional)</label>
          <input
            value={targetCustomer}
            onChange={(e) => setTargetCustomer(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Families in Atlanta looking for…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Brand voice (optional)</label>
          <input
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Professional, friendly, short paragraphs"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <div className="text-xs text-zinc-500 sm:self-center">
          We use this to personalize onboarding and content.
        </div>
      </div>
    </div>
  );
}
