"use client";

import { useEffect, useMemo, useState } from "react";
import { PortalMediaPickerModal } from "@/components/PortalMediaPickerModal";
import { useToast } from "@/components/ToastProvider";

type BusinessProfile = {
  businessName: string;
  websiteUrl: string | null;
  industry: string | null;
  businessModel: string | null;
  primaryGoals: unknown;
  targetCustomer: string | null;
  brandVoice: string | null;

  logoUrl?: string | null;
  brandPrimaryHex?: string | null;
  brandAccentHex?: string | null;
  brandTextHex?: string | null;
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
  embedded,
  readOnly,
  onSaved,
}: {
  title?: string;
  description?: string;
  embedded?: boolean;
  readOnly?: boolean;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [primaryGoalsText, setPrimaryGoalsText] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [brandVoice, setBrandVoice] = useState("");

  const [logoUrl, setLogoUrl] = useState("");
  const [brandPrimaryHex, setBrandPrimaryHex] = useState("");
  const [brandAccentHex, setBrandAccentHex] = useState("");
  const [brandTextHex, setBrandTextHex] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  const canSave = useMemo(() => !readOnly && businessName.trim().length >= 2, [businessName, readOnly]);

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

        setLogoUrl(p.logoUrl ?? "");
        setBrandPrimaryHex(p.brandPrimaryHex ?? "");
        setBrandAccentHex(p.brandAccentHex ?? "");
        setBrandTextHex(p.brandTextHex ?? "");
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

        logoUrl,
        brandPrimaryHex,
        brandAccentHex,
        brandTextHex,
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
    return embedded ? (
      <div className="text-sm text-zinc-600">Loading business profile…</div>
    ) : (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading business profile…
      </div>
    );
  }

  const content = (
    <>
      {!embedded ? (
        <>
          <div className="text-sm font-semibold text-zinc-900">{title ?? "Business profile"}</div>
          <div className="mt-2 text-sm text-zinc-600">
            {description ?? "This helps us tailor services and onboarding to your business."}
          </div>
        </>
      ) : null}

      <div className={(embedded ? "mt-2" : "mt-5") + " grid grid-cols-1 gap-4 sm:grid-cols-2"}>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Logo (optional)</label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs text-zinc-500">{logoUrl ? logoUrl : "No logo uploaded"}</div>
                <div className="mt-1 text-xs text-zinc-500">Recommended: square image, under 2MB.</div>
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50">
              {logoBusy ? "Uploading…" : "Upload"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={logoBusy || Boolean(readOnly)}
                onChange={async (e) => {
                  if (readOnly) return;
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLogoBusy(true);
                  setError(null);
                  try {
                    const fd = new FormData();
                    fd.set("file", file);
                    const up = await fetch("/api/uploads", { method: "POST", body: fd });
                    const upBody = (await up.json().catch(() => ({}))) as { url?: string; error?: string };
                    if (!up.ok || !upBody.url) {
                      setError(upBody.error ?? "Upload failed");
                      return;
                    }
                    setLogoUrl(upBody.url);
                  } finally {
                    setLogoBusy(false);
                    if (e.target) e.target.value = "";
                  }
                }}
              />
            </label>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              onClick={() => !readOnly && setLogoPickerOpen(true)}
              disabled={Boolean(readOnly)}
            >
              Choose from media library
            </button>
          </div>
        </div>

        <PortalMediaPickerModal
          open={logoPickerOpen}
          title="Choose a logo"
          confirmLabel="Use"
          onClose={() => setLogoPickerOpen(false)}
          onPick={(item) => {
            setLogoUrl(item.shareUrl);
            setLogoPickerOpen(false);
          }}
        />

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Business name</label>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Acme Dental"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Website (optional)</label>
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Industry (optional)</label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Home services, dental, legal…"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Business model (optional)</label>
          <input
            value={businessModel}
            onChange={(e) => setBusinessModel(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Appointments, subscriptions, one-time jobs…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Primary goals (optional)</label>
          <input
            value={primaryGoalsText}
            onChange={(e) => setPrimaryGoalsText(e.target.value)}
            disabled={Boolean(readOnly)}
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
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Families in Atlanta looking for…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Brand voice (optional)</label>
          <input
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Professional, friendly, short paragraphs"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Brand primary color (optional)</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={brandPrimaryHex}
              onChange={(e) => setBrandPrimaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#1d4ed8"
            />
            <div className="h-10 w-10 rounded-2xl border border-zinc-200" style={{ background: brandPrimaryHex || "#1d4ed8" }} />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Brand accent color (optional)</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={brandAccentHex}
              onChange={(e) => setBrandAccentHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#fb7185"
            />
            <div className="h-10 w-10 rounded-2xl border border-zinc-200" style={{ background: brandAccentHex || "#fb7185" }} />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Text color (optional)</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={brandTextHex}
              onChange={(e) => setBrandTextHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#0f172a"
            />
            <div className="flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs" style={{ color: brandTextHex || "#0f172a" }}>
              Aa
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {!readOnly ? (
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            You have view-only access.
          </div>
        )}
        <div className="text-xs text-zinc-500 sm:self-center">
          We use this to personalize onboarding and content.
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return <div className="rounded-3xl border border-zinc-200 bg-white p-6">{content}</div>;
}
