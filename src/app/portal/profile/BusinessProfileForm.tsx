"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PortalMediaPickerModal } from "@/components/PortalMediaPickerModal";
import { useToast } from "@/components/ToastProvider";
import { PortalFontDropdown } from "@/components/PortalFontDropdown";
import { applyFontPresetToStyle, fontPresetKeyFromStyle } from "@/lib/fontPresets";

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
  brandSecondaryHex?: string | null;
  brandAccentHex?: string | null;
  brandTextHex?: string | null;

  brandFontFamily?: string | null;
  brandFontGoogleFamily?: string | null;
  updatedAt?: string;

  hostedTheme?: {
    version: 1;
    bgHex: string | null;
    surfaceHex: string | null;
    softHex: string | null;
    borderHex: string | null;
    textHex: string | null;
    mutedTextHex: string | null;
    primaryHex: string | null;
    accentHex: string | null;
    linkHex: string | null;
  };
};

type ApiGet = { ok: boolean; profile: BusinessProfile | null };

type ApiPut = { ok: boolean; profile: BusinessProfile };

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeGoals(goals: unknown) {
  if (!Array.isArray(goals)) return [] as string[];
  const out: string[] = [];
  for (const g of goals) {
    if (typeof g !== "string") continue;
    const v = g.trim();
    if (!v) continue;
    if (out.includes(v)) continue;
    out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

function safeColorValue(value: string, fallback: string) {
  const v = String(value || "").trim();
  return HEX_RE.test(v) ? v : fallback;
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
  const lastSavedSigRef = useRef<string>("{}");

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [primaryGoals, setPrimaryGoals] = useState<string[]>([]);
  const [primaryGoalDraft, setPrimaryGoalDraft] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [brandVoice, setBrandVoice] = useState("");

  const [logoUrl, setLogoUrl] = useState("");
  const [brandPrimaryHex, setBrandPrimaryHex] = useState("");
  const [brandSecondaryHex, setBrandSecondaryHex] = useState("");
  const [brandAccentHex, setBrandAccentHex] = useState("");
  const [brandTextHex, setBrandTextHex] = useState("");
  const [brandFontFamily, setBrandFontFamily] = useState("");
  const [brandFontGoogleFamily, setBrandFontGoogleFamily] = useState("");

  const [hostedBgHex, setHostedBgHex] = useState("");
  const [hostedSurfaceHex, setHostedSurfaceHex] = useState("");
  const [hostedSoftHex, setHostedSoftHex] = useState("");
  const [hostedBorderHex, setHostedBorderHex] = useState("");
  const [hostedTextHex, setHostedTextHex] = useState("");
  const [hostedMutedTextHex, setHostedMutedTextHex] = useState("");
  const [hostedPrimaryHex, setHostedPrimaryHex] = useState("");
  const [hostedAccentHex, setHostedAccentHex] = useState("");
  const [hostedLinkHex, setHostedLinkHex] = useState("");

  const [logoBusy, setLogoBusy] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  const brandFontPresetKeyRaw = useMemo(
    () => fontPresetKeyFromStyle({ fontFamily: brandFontFamily, fontGoogleFamily: brandFontGoogleFamily }),
    [brandFontFamily, brandFontGoogleFamily],
  );

  const brandFontPresetKey = brandFontPresetKeyRaw === "custom" ? "default" : brandFontPresetKeyRaw;

  const canSave = useMemo(() => !readOnly && businessName.trim().length >= 2, [businessName, readOnly]);

  const currentSig = useMemo(() => {
    const normalize = (v: string) => String(v || "").trim();
    const goals = (primaryGoals || [])
      .map((g) => String(g || "").trim())
      .filter(Boolean)
      .slice(0, 10);

    return JSON.stringify({
      businessName: normalize(businessName),
      websiteUrl: normalize(websiteUrl),
      industry: normalize(industry),
      businessModel: normalize(businessModel),
      primaryGoals: goals,
      targetCustomer: normalize(targetCustomer),
      brandVoice: normalize(brandVoice),

      logoUrl: normalize(logoUrl),
      brandPrimaryHex: normalize(brandPrimaryHex),
      brandSecondaryHex: normalize(brandSecondaryHex),
      brandAccentHex: normalize(brandAccentHex),
      brandTextHex: normalize(brandTextHex),

      brandFontFamily: normalize(brandFontFamily),
      brandFontGoogleFamily: normalize(brandFontGoogleFamily),

      hostedTheme: {
        bgHex: normalize(hostedBgHex),
        surfaceHex: normalize(hostedSurfaceHex),
        softHex: normalize(hostedSoftHex),
        borderHex: normalize(hostedBorderHex),
        textHex: normalize(hostedTextHex),
        mutedTextHex: normalize(hostedMutedTextHex),
        primaryHex: normalize(hostedPrimaryHex),
        accentHex: normalize(hostedAccentHex),
        linkHex: normalize(hostedLinkHex),
      },
    });
  }, [
    businessName,
    websiteUrl,
    industry,
    businessModel,
    primaryGoals,
    targetCustomer,
    brandVoice,
    logoUrl,
    brandPrimaryHex,
    brandSecondaryHex,
    brandAccentHex,
    brandTextHex,
    brandFontFamily,
    brandFontGoogleFamily,
    hostedBgHex,
    hostedSurfaceHex,
    hostedSoftHex,
    hostedBorderHex,
    hostedTextHex,
    hostedMutedTextHex,
    hostedPrimaryHex,
    hostedAccentHex,
    hostedLinkHex,
  ]);

  const dirty = currentSig !== lastSavedSigRef.current;

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
        const nextBusinessName = p.businessName ?? "";
        const nextWebsiteUrl = p.websiteUrl ?? "";
        const nextIndustry = p.industry ?? "";
        const nextBusinessModel = p.businessModel ?? "";
        const nextPrimaryGoals = normalizeGoals(p.primaryGoals);
        const nextTargetCustomer = p.targetCustomer ?? "";
        const nextBrandVoice = p.brandVoice ?? "";

        const nextLogoUrl = p.logoUrl ?? "";
        const nextBrandPrimaryHex = p.brandPrimaryHex ?? "";
        const nextBrandSecondaryHex = p.brandSecondaryHex ?? "";
        const nextBrandAccentHex = p.brandAccentHex ?? "";
        const nextBrandTextHex = p.brandTextHex ?? "";

        const nextBrandFontFamily = p.brandFontFamily ?? "";
        const nextBrandFontGoogleFamily = p.brandFontGoogleFamily ?? "";

        const hosted = p.hostedTheme;
        const nextHostedBgHex = hosted?.bgHex ?? "";
        const nextHostedSurfaceHex = hosted?.surfaceHex ?? "";
        const nextHostedSoftHex = hosted?.softHex ?? "";
        const nextHostedBorderHex = hosted?.borderHex ?? "";
        const nextHostedTextHex = hosted?.textHex ?? "";
        const nextHostedMutedTextHex = hosted?.mutedTextHex ?? "";
        const nextHostedPrimaryHex = hosted?.primaryHex ?? "";
        const nextHostedAccentHex = hosted?.accentHex ?? "";
        const nextHostedLinkHex = hosted?.linkHex ?? "";

        setBusinessName(nextBusinessName);
        setWebsiteUrl(nextWebsiteUrl);
        setIndustry(nextIndustry);
        setBusinessModel(nextBusinessModel);
        setPrimaryGoals(nextPrimaryGoals);
        setTargetCustomer(nextTargetCustomer);
        setBrandVoice(nextBrandVoice);

        setLogoUrl(nextLogoUrl);
        setBrandPrimaryHex(nextBrandPrimaryHex);
        setBrandSecondaryHex(nextBrandSecondaryHex);
        setBrandAccentHex(nextBrandAccentHex);
        setBrandTextHex(nextBrandTextHex);

        setBrandFontFamily(nextBrandFontFamily);
        setBrandFontGoogleFamily(nextBrandFontGoogleFamily);

        setHostedBgHex(nextHostedBgHex);
        setHostedSurfaceHex(nextHostedSurfaceHex);
        setHostedSoftHex(nextHostedSoftHex);
        setHostedBorderHex(nextHostedBorderHex);
        setHostedTextHex(nextHostedTextHex);
        setHostedMutedTextHex(nextHostedMutedTextHex);
        setHostedPrimaryHex(nextHostedPrimaryHex);
        setHostedAccentHex(nextHostedAccentHex);
        setHostedLinkHex(nextHostedLinkHex);

        lastSavedSigRef.current = JSON.stringify({
          businessName: String(nextBusinessName || "").trim(),
          websiteUrl: String(nextWebsiteUrl || "").trim(),
          industry: String(nextIndustry || "").trim(),
          businessModel: String(nextBusinessModel || "").trim(),
          primaryGoals: (nextPrimaryGoals || [])
            .map((g) => String(g || "").trim())
            .filter(Boolean)
            .slice(0, 10),
          targetCustomer: String(nextTargetCustomer || "").trim(),
          brandVoice: String(nextBrandVoice || "").trim(),

          logoUrl: String(nextLogoUrl || "").trim(),
          brandPrimaryHex: String(nextBrandPrimaryHex || "").trim(),
          brandSecondaryHex: String(nextBrandSecondaryHex || "").trim(),
          brandAccentHex: String(nextBrandAccentHex || "").trim(),
          brandTextHex: String(nextBrandTextHex || "").trim(),

          brandFontFamily: String(nextBrandFontFamily || "").trim(),
          brandFontGoogleFamily: String(nextBrandFontGoogleFamily || "").trim(),

          hostedTheme: {
            bgHex: String(nextHostedBgHex || "").trim(),
            surfaceHex: String(nextHostedSurfaceHex || "").trim(),
            softHex: String(nextHostedSoftHex || "").trim(),
            borderHex: String(nextHostedBorderHex || "").trim(),
            textHex: String(nextHostedTextHex || "").trim(),
            mutedTextHex: String(nextHostedMutedTextHex || "").trim(),
            primaryHex: String(nextHostedPrimaryHex || "").trim(),
            accentHex: String(nextHostedAccentHex || "").trim(),
            linkHex: String(nextHostedLinkHex || "").trim(),
          },
        });
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

    const fontFamilyToSave = brandFontPresetKeyRaw === "custom" ? "" : brandFontFamily;
    const fontGoogleFamilyToSave = brandFontPresetKeyRaw === "custom" ? "" : brandFontGoogleFamily;

    const res = await fetch("/api/portal/business-profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessName,
        websiteUrl,
        industry,
        businessModel,
        primaryGoals: primaryGoals.length ? primaryGoals : undefined,
        targetCustomer,
        brandVoice,

        logoUrl,
        brandPrimaryHex,
        brandSecondaryHex,
        brandAccentHex,
        brandTextHex,

        brandFontFamily: fontFamilyToSave,
        brandFontGoogleFamily: fontGoogleFamilyToSave,

        hostedTheme: {
          bgHex: hostedBgHex,
          surfaceHex: hostedSurfaceHex,
          softHex: hostedSoftHex,
          borderHex: hostedBorderHex,
          textHex: hostedTextHex,
          mutedTextHex: hostedMutedTextHex,
          primaryHex: hostedPrimaryHex,
          accentHex: hostedAccentHex,
          linkHex: hostedLinkHex,
        },
      }),
    });

    const json = (await res.json().catch(() => ({}))) as Partial<ApiPut> & { error?: string };
    setSaving(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to save");
      return;
    }

    lastSavedSigRef.current = currentSig;

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
          <label className="text-xs font-semibold text-zinc-600">Logo</label>
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
          <label className="text-xs font-semibold text-zinc-600">Website</label>
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Industry</label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Home services, dental, legal…"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Business model</label>
          <input
            value={businessModel}
            onChange={(e) => setBusinessModel(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Appointments, subscriptions, one-time jobs…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Primary goals</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              value={primaryGoalDraft}
              onChange={(e) => setPrimaryGoalDraft(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="Add a goal (e.g. More leads)"
            />
            <button
              type="button"
              disabled={Boolean(readOnly)}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => {
                if (readOnly) return;
                const v = primaryGoalDraft.trim();
                if (!v) return;
                setPrimaryGoals((xs) => {
                  if (xs.includes(v)) return xs;
                  if (xs.length >= 10) return xs;
                  return [...xs, v];
                });
                setPrimaryGoalDraft("");
              }}
            >
              + Add
            </button>
          </div>

          {primaryGoals.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {primaryGoals.map((g) => (
                <button
                  key={g}
                  type="button"
                  disabled={Boolean(readOnly)}
                  onClick={() => !readOnly && setPrimaryGoals((xs) => xs.filter((x) => x !== g))}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-60"
                  title={readOnly ? undefined : "Remove"}
                >
                  <span className="max-w-[18rem] truncate">{g}</span>
                  {!readOnly ? <span className="text-zinc-500">×</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-zinc-500">Add up to 10 goals.</div>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Target customer</label>
          <input
            value={targetCustomer}
            onChange={(e) => setTargetCustomer(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Families in Atlanta looking for…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Brand voice</label>
          <input
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Professional, friendly, short paragraphs"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Business font</label>
          <div className="mt-1">
            <PortalFontDropdown
              value={brandFontPresetKey}
              onChange={(k) => {
                if (readOnly) return;
                const key = String(k || "default");
                const next = applyFontPresetToStyle(key);
                setBrandFontFamily(next.fontFamily || "");
                setBrandFontGoogleFamily(next.fontGoogleFamily || "");
              }}
              extraOptions={[{ value: "default", label: "Default (app font)" }]}
              className="w-full"
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 hover:bg-zinc-50"
              disabled={Boolean(readOnly)}
            />
          </div>

          {brandFontPresetKeyRaw === "custom" ? (
            <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              A custom font was previously set. Custom fonts are no longer supported. Choose a preset to update.
            </div>
          ) : null}
          <div className="mt-1 text-xs text-zinc-500">Used for hosted page styling and templates.</div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Brand primary color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={safeColorValue(brandPrimaryHex, "#1d4ed8")}
              onChange={(e) => setBrandPrimaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
              aria-label="Pick primary color"
            />
            <input
              value={brandPrimaryHex}
              onChange={(e) => setBrandPrimaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#1d4ed8"
            />
            <div
              className="h-10 w-10 rounded-2xl border border-zinc-200"
              style={{ background: safeColorValue(brandPrimaryHex, "#1d4ed8") }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Brand secondary color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={safeColorValue(brandSecondaryHex, "#22c55e")}
              onChange={(e) => setBrandSecondaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
              aria-label="Pick secondary color"
            />
            <input
              value={brandSecondaryHex}
              onChange={(e) => setBrandSecondaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#22c55e"
            />
            <div
              className="h-10 w-10 rounded-2xl border border-zinc-200"
              style={{ background: safeColorValue(brandSecondaryHex, "#22c55e") }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Brand accent color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={safeColorValue(brandAccentHex, "#fb7185")}
              onChange={(e) => setBrandAccentHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
              aria-label="Pick accent color"
            />
            <input
              value={brandAccentHex}
              onChange={(e) => setBrandAccentHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#fb7185"
            />
            <div
              className="h-10 w-10 rounded-2xl border border-zinc-200"
              style={{ background: safeColorValue(brandAccentHex, "#fb7185") }}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Text color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={safeColorValue(brandTextHex, "#0f172a")}
              onChange={(e) => setBrandTextHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
              aria-label="Pick text color"
            />
            <input
              value={brandTextHex}
              onChange={(e) => setBrandTextHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#0f172a"
            />
            <div
              className="flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs"
              style={{ color: safeColorValue(brandTextHex, "#0f172a") }}
            >
              Aa
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Hosted pages theme overrides</div>
              <div className="mt-1 text-xs text-zinc-500">
                Optional. Leave any field blank to inherit the theme derived from your brand colors. This affects hosted pages like blogs and reviews.
              </div>
            </div>
            {!readOnly ? (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                onClick={() => {
                  setHostedBgHex("");
                  setHostedSurfaceHex("");
                  setHostedSoftHex("");
                  setHostedBorderHex("");
                  setHostedTextHex("");
                  setHostedMutedTextHex("");
                  setHostedPrimaryHex("");
                  setHostedAccentHex("");
                  setHostedLinkHex("");
                }}
              >
                Reset hosted overrides
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Background</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedBgHex, "#ffffff")}
                  onChange={(e) => setHostedBgHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted background"
                />
                <input
                  value={hostedBgHex}
                  onChange={(e) => setHostedBgHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div className="h-10 w-10 rounded-2xl border border-zinc-200" style={{ background: safeColorValue(hostedBgHex, "#ffffff") }} />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Surface (cards)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedSurfaceHex, "#ffffff")}
                  onChange={(e) => setHostedSurfaceHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted surface"
                />
                <input
                  value={hostedSurfaceHex}
                  onChange={(e) => setHostedSurfaceHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div className="h-10 w-10 rounded-2xl border border-zinc-200" style={{ background: safeColorValue(hostedSurfaceHex, "#ffffff") }} />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Soft background (chips)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedSoftHex, "#f4f4f5")}
                  onChange={(e) => setHostedSoftHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted soft background"
                />
                <input
                  value={hostedSoftHex}
                  onChange={(e) => setHostedSoftHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div className="h-10 w-10 rounded-2xl border border-zinc-200" style={{ background: safeColorValue(hostedSoftHex, "#f4f4f5") }} />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Border</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedBorderHex, "#e4e4e7")}
                  onChange={(e) => setHostedBorderHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted border"
                />
                <input
                  value={hostedBorderHex}
                  onChange={(e) => setHostedBorderHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div className="h-10 w-10 rounded-2xl border border-zinc-200" style={{ background: safeColorValue(hostedBorderHex, "#e4e4e7") }} />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Text</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedTextHex, "#18181b")}
                  onChange={(e) => setHostedTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted text"
                />
                <input
                  value={hostedTextHex}
                  onChange={(e) => setHostedTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div className="flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs" style={{ color: safeColorValue(hostedTextHex, "#18181b") }}>
                  Aa
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Muted text</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedMutedTextHex, "#52525b")}
                  onChange={(e) => setHostedMutedTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted muted text"
                />
                <input
                  value={hostedMutedTextHex}
                  onChange={(e) => setHostedMutedTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div className="flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs" style={{ color: safeColorValue(hostedMutedTextHex, "#52525b") }}>
                  Aa
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Primary (buttons)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedPrimaryHex, safeColorValue(brandPrimaryHex, "#1d4ed8"))}
                  onChange={(e) => setHostedPrimaryHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted primary"
                />
                <input
                  value={hostedPrimaryHex}
                  onChange={(e) => setHostedPrimaryHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{ background: safeColorValue(hostedPrimaryHex, safeColorValue(brandPrimaryHex, "#1d4ed8")) }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Accent (highlights)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedAccentHex, safeColorValue(brandAccentHex, "#fb7185"))}
                  onChange={(e) => setHostedAccentHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted accent"
                />
                <input
                  value={hostedAccentHex}
                  onChange={(e) => setHostedAccentHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{ background: safeColorValue(hostedAccentHex, safeColorValue(brandAccentHex, "#fb7185")) }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">Link</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedLinkHex, safeColorValue(brandPrimaryHex, "#2563eb"))}
                  onChange={(e) => setHostedLinkHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted link"
                />
                <input
                  value={hostedLinkHex}
                  onChange={(e) => setHostedLinkHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{ background: safeColorValue(hostedLinkHex, safeColorValue(brandPrimaryHex, "#2563eb")) }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {!readOnly ? (
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving || !dirty}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
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
