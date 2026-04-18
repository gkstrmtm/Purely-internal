"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PortalMediaPickerModal } from "@/components/PortalMediaPickerModal";
import { useToast } from "@/components/ToastProvider";
import { PortalFontDropdown } from "@/components/PortalFontDropdown";
import { portalGlassButtonClass } from "@/components/portalGlass";
import { applyFontPresetToStyle, fontPresetKeyFromStyle } from "@/lib/fontPresets";
import { CreatableMultiSelectField } from "./BusinessProfileControls";

type BusinessProfile = {
  businessName: string;
  websiteUrl: string | null;
  industry: string | null;
  businessModel: string | null;
  primaryGoals: unknown;
  targetCustomer: string | null;
  brandVoice: string | null;
  businessContextNotes?: string | null;

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

function normalizeUniqueList(values: unknown, maxItems = 10) {
  if (!Array.isArray(values)) return [] as string[];
  const out: string[] = [];
  for (const value of values) {
    const next = String(value || "").trim();
    if (!next) continue;
    if (out.some((entry) => entry.toLowerCase() === next.toLowerCase())) continue;
    out.push(next);
    if (out.length >= maxItems) break;
  }
  return out;
}

function parseDelimitedTags(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return [] as string[];
  const parts = raw.split(/\s*(?:;|\n|•)\s*/g);
  return normalizeUniqueList(parts, 10);
}

function joinDelimitedTags(values: string[]) {
  return normalizeUniqueList(values, 10).join("; ");
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const nativeColorInputClassName =
  "h-11 w-11 shrink-0 cursor-pointer appearance-none overflow-hidden rounded-xl border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-xl [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:border-0";

const PRIMARY_GOAL_OPTIONS = [
  "More leads",
  "More booked appointments",
  "Better follow-up",
  "Higher close rate",
  "More reviews",
  "More repeat customers",
  "Less manual work",
  "Stronger online presence",
].map((label) => ({ value: label, label }));

const TARGET_CUSTOMER_OPTIONS = [
  "Homeowners",
  "Local families",
  "Busy professionals",
  "Small business owners",
  "High-income households",
  "First-time buyers",
  "Returning customers",
  "Local service clients",
].map((label) => ({ value: label, label }));

const BRAND_VOICE_OPTIONS = [
  "Professional",
  "Friendly",
  "Confident",
  "Luxury",
  "Warm",
  "Direct",
  "Educational",
  "Playful",
].map((label) => ({ value: label, label }));

export function BusinessProfileForm({
  title,
  description,
  embedded,
  readOnly,
  onSaved,
  businessEmailContent,
}: {
  title?: string;
  description?: string;
  embedded?: boolean;
  readOnly?: boolean;
  onSaved?: () => void;
  businessEmailContent?: ReactNode;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedSigRef = useRef<string>("{}");
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const logoMenuRef = useRef<HTMLDivElement | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (!logoMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (logoMenuRef.current?.contains(event.target as Node)) return;
      setLogoMenuOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown, true);
    return () => window.removeEventListener("mousedown", handlePointerDown, true);
  }, [logoMenuOpen]);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [primaryGoals, setPrimaryGoals] = useState<string[]>([]);
  const [targetCustomers, setTargetCustomers] = useState<string[]>([]);
  const [brandVoices, setBrandVoices] = useState<string[]>([]);
  const [businessContextNotes, setBusinessContextNotes] = useState("");

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
      targetCustomers: normalizeUniqueList(targetCustomers, 10),
      brandVoices: normalizeUniqueList(brandVoices, 10),
      businessContextNotes: normalize(businessContextNotes),

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
    targetCustomers,
    brandVoices,
    businessContextNotes,
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
        const nextTargetCustomers = parseDelimitedTags(p.targetCustomer);
        const nextBrandVoices = parseDelimitedTags(p.brandVoice);
        const nextBusinessContextNotes = p.businessContextNotes ?? "";

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
        setTargetCustomers(nextTargetCustomers);
        setBrandVoices(nextBrandVoices);
        setBusinessContextNotes(nextBusinessContextNotes);

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
          targetCustomers: normalizeUniqueList(nextTargetCustomers, 10),
          brandVoices: normalizeUniqueList(nextBrandVoices, 10),
          businessContextNotes: String(nextBusinessContextNotes || "").trim(),

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
        targetCustomer: joinDelimitedTags(targetCustomers),
        brandVoice: joinDelimitedTags(brandVoices),
        businessContextNotes,

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
  setLogoMenuOpen(false);

    onSaved?.();
  }

  async function uploadLogoFile(file: File | null | undefined) {
    if (!file || readOnly) return;
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
      setLogoMenuOpen(false);
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
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
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={logoBusy || Boolean(readOnly)}
            onChange={(event) => void uploadLogoFile(event.target.files?.[0])}
          />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden sm:h-40 sm:w-40">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Business logo" className="h-full w-full object-contain" />
              ) : (
                <span className="px-4 text-center text-xs font-semibold text-zinc-400">No logo</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm text-zinc-600">Recommended: PNG or JPG with a transparent background if possible.</div>
              <div className="mt-1 text-xs text-zinc-500">Use a square or nearly square image for the cleanest fit.</div>

              <div ref={logoMenuRef} className="mt-4 flex flex-wrap items-center gap-2">
                {logoUrl ? (
                  <>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => !readOnly && setLogoMenuOpen((current) => !current)}
                        disabled={Boolean(readOnly) || logoBusy}
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        {logoBusy ? "Uploading…" : "Change logo"}
                      </button>

                      {logoMenuOpen ? (
                        <div className="absolute left-0 top-full z-20 mt-2 min-w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                            onClick={() => {
                              setLogoMenuOpen(false);
                              logoInputRef.current?.click();
                            }}
                          >
                            Upload new logo
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                            onClick={() => {
                              setLogoMenuOpen(false);
                              setLogoPickerOpen(true);
                            }}
                          >
                            Choose from media library
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (readOnly) return;
                        setLogoUrl("");
                        setLogoMenuOpen(false);
                      }}
                      disabled={Boolean(readOnly) || logoBusy}
                      className="inline-flex items-center justify-center rounded-2xl bg-[rgba(220,38,38,0.08)] px-4 py-2.5 text-sm font-semibold text-[#dc2626] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[rgba(220,38,38,0.10)] hover:text-[#b91c1c] disabled:opacity-60"
                    >
                      Delete logo
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={Boolean(readOnly) || logoBusy}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {logoBusy ? "Uploading…" : "Upload"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                      onClick={() => !readOnly && setLogoPickerOpen(true)}
                      disabled={Boolean(readOnly) || logoBusy}
                    >
                      Choose from media library
                    </button>
                  </>
                )}
              </div>
            </div>
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
            setLogoMenuOpen(false);
          }}
        />

        <div>
          <label className="text-xs font-semibold text-zinc-600">Business name</label>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
            placeholder="Acme Dental"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Website</label>
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Industry</label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
            placeholder="Home services, dental, legal…"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">Business model</label>
          <input
            value={businessModel}
            onChange={(e) => setBusinessModel(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
            placeholder="Appointments, subscriptions, one-time jobs…"
          />
        </div>

        {businessEmailContent ? <div className="sm:col-span-2">{businessEmailContent}</div> : null}

        <div className="sm:col-span-2">
          <CreatableMultiSelectField
            label="Primary goals"
            value={primaryGoals}
            options={PRIMARY_GOAL_OPTIONS}
            onChange={setPrimaryGoals}
            disabled={Boolean(readOnly)}
            placeholder="Search or add a goal"
            hint="Choose up to 10 goals, or type your own."
            maxItems={10}
          />
        </div>

        <div className="sm:col-span-2">
          <CreatableMultiSelectField
            label="Target customer"
            value={targetCustomers}
            options={TARGET_CUSTOMER_OPTIONS}
            onChange={setTargetCustomers}
            disabled={Boolean(readOnly)}
            placeholder="Search or add a customer type"
            hint="Select audience types or add custom ones."
            maxItems={10}
          />
        </div>

        <div className="sm:col-span-2">
          <CreatableMultiSelectField
            label="Brand voice"
            value={brandVoices}
            options={BRAND_VOICE_OPTIONS}
            onChange={setBrandVoices}
            disabled={Boolean(readOnly)}
            placeholder="Search or add a voice trait"
            hint="Pick multiple voice traits or add your own."
            maxItems={10}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Additional business context</label>
          <textarea
            value={businessContextNotes}
            onChange={(e) => setBusinessContextNotes(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 min-h-28 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Anything extra you want Pura, AI calls, or the rest of the platform to know about your business."
          />
          <div className="mt-1 text-xs text-zinc-500">Use this for extra context, special instructions, tone preferences, or business details that don’t fit the fields above.</div>
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
              buttonClassName={classNames(
                "flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-white/55 px-4 text-sm text-zinc-900 transition-all duration-150 hover:-translate-y-0.5 hover:border-white/70 hover:bg-white/80",
                portalGlassButtonClass,
              )}
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

        <div className="sm:col-span-2">
          <div className="text-sm font-semibold text-zinc-900">Brand colors</div>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Brand primary color</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={brandPrimaryHex || "#1d4ed8"}
                  onChange={(e) => setBrandPrimaryHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className={nativeColorInputClassName}
                  aria-label="Pick primary color"
                />
                <input
                  value={brandPrimaryHex}
                  onChange={(e) => setBrandPrimaryHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
                  placeholder="#1d4ed8"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600">Brand secondary color</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={brandSecondaryHex || "#22c55e"}
                  onChange={(e) => setBrandSecondaryHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className={nativeColorInputClassName}
                  aria-label="Pick secondary color"
                />
                <input
                  value={brandSecondaryHex}
                  onChange={(e) => setBrandSecondaryHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
                  placeholder="#22c55e"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600">Brand accent color</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={brandAccentHex || "#fb7185"}
                  onChange={(e) => setBrandAccentHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className={nativeColorInputClassName}
                  aria-label="Pick accent color"
                />
                <input
                  value={brandAccentHex}
                  onChange={(e) => setBrandAccentHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
                  placeholder="#fb7185"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-600">Text color</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={brandTextHex || "#0f172a"}
                  onChange={(e) => setBrandTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className={nativeColorInputClassName}
                  aria-label="Pick text color"
                />
                <input
                  value={brandTextHex}
                  onChange={(e) => setBrandTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
                  placeholder="#0f172a"
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
            className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
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
