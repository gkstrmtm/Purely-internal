"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppConfirmModal } from "@/components/AppModal";
import { LocalDateTimePicker } from "@/components/LocalDateTimePicker";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalMultiSelectDropdown } from "@/components/PortalMultiSelectDropdown";
import { BUSINESS_MODEL_SUGGESTIONS, INDUSTRY_SUGGESTIONS } from "@/lib/portalOnboardingWizardCatalog";

type Audience = { id: string; name: string; targetingJson: any };

type Placement = "SIDEBAR_BANNER" | "TOP_BANNER" | "POPUP_CARD";

function usdToCents(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return Math.max(0, Math.round(n * 100));
}

function dedupe(list: string[]) {
  const out: string[] = [];
  for (const v of list) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

export default function NewAdsCampaignPage() {
  const router = useRouter();

  // Advertisers do not choose placement; it's assigned internally.
  const placement: Placement = "POPUP_CARD";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("My campaign");

  const [startAt, setStartAt] = useState<string>("");
  const [endAt, setEndAt] = useState<string>("");

  const [dailyBudgetUsd, setDailyBudgetUsd] = useState("50.00");

  const [industries, setIndustries] = useState<string[]>([]);
  const [businessModels, setBusinessModels] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);

  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [linkUrl, setLinkUrl] = useState("https://purelyautomation.com");
  const [creativeBusy, setCreativeBusy] = useState(false);

  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showAllPreviews, setShowAllPreviews] = useState(true);

  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "">("");
  const [mediaFit, setMediaFit] = useState<"cover" | "contain">("cover");
  const [mediaPosition, setMediaPosition] = useState("50% 50%");
  const [sidebarImageHeight, setSidebarImageHeight] = useState<number>(140);
  const [topBannerImageSize, setTopBannerImageSize] = useState<number>(96);

  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audienceId, setAudienceId] = useState<string>("");
  const [audienceName, setAudienceName] = useState<string>("");
  const [audienceBusy, setAudienceBusy] = useState(false);

  const [deleteAudienceModal, setDeleteAudienceModal] = useState<null | { id: string; name: string }>(null);

  const [me, setMe] = useState<any>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  const balanceCents = Number(me?.account?.balanceCents || 0);

  async function loadAudiences() {
    try {
      const res = await fetch("/ads/api/audiences", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setAudiences([]);
        return;
      }
      setAudiences(Array.isArray(json?.audiences) ? (json.audiences as Audience[]) : []);
    } catch {
      setAudiences([]);
    }
  }

  useEffect(() => {
    void loadAudiences();
  }, []);

  async function loadMe() {
    setAccountBusy(true);
    try {
      const res = await fetch("/ads/api/me", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to load account"));
      setMe(json);
    } catch {
      // ignore
    } finally {
      setAccountBusy(false);
    }
  }

  useEffect(() => {
    void loadMe();
  }, []);

  useEffect(() => {
    if (!audienceId) return;
    const a = audiences.find((x) => x.id === audienceId);
    if (!a) return;
    const t = (a.targetingJson ?? {}) as any;
    setIndustries(dedupe(Array.isArray(t.industries) ? t.industries : []));
    setBusinessModels(dedupe(Array.isArray(t.businessModels) ? t.businessModels : []));
    setLocations(dedupe(Array.isArray(t.locations) ? t.locations : []));
  }, [audienceId, audiences]);

  async function saveAudience() {
    const nameTrimmed = audienceName.trim();
    if (!nameTrimmed) {
      setError("Audience profile name is required");
      return;
    }

    setAudienceBusy(true);
    setError(null);
    try {
      const res = await fetch("/ads/api/audiences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: nameTrimmed,
          targeting: {
            industries: dedupe(industries),
            businessModels: dedupe(businessModels),
            locations: dedupe(locations),
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Save failed"));

      setAudienceName("");
      await loadAudiences();
      if (typeof json?.id === "string" && json.id) setAudienceId(json.id);
    } catch (err: any) {
      setError(String(err?.message || "Save failed"));
    } finally {
      setAudienceBusy(false);
    }
  }

  async function deleteAudience() {
    if (!audienceId) return;
    const a = audiences.find((x) => x.id === audienceId);
    if (!a) return;
    setDeleteAudienceModal({ id: audienceId, name: a.name });
  }

  async function confirmDeleteAudience() {
    if (audienceBusy) return;
    if (!deleteAudienceModal?.id) return;

    setAudienceBusy(true);
    setError(null);
    try {
      const res = await fetch(`/ads/api/audiences/${deleteAudienceModal.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Delete failed"));

      if (audienceId === deleteAudienceModal.id) setAudienceId("");
      await loadAudiences();
      setDeleteAudienceModal(null);
    } catch (err: any) {
      setError(String(err?.message || "Delete failed"));
    } finally {
      setAudienceBusy(false);
    }
  }

  async function uploadFile(file: File) {
    setUploadBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/ads/api/uploads", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(String(json?.error || "Upload failed"));

      const url = String(json?.url || "");
      setMediaUrl(url);

      const mime = String(json?.mimeType || file.type || "");
      if (mime.startsWith("video/")) setMediaKind("video");
      else if (mime.startsWith("image/")) setMediaKind("image");
    } catch (err: any) {
      setError(String(err?.message || "Upload failed"));
    } finally {
      setUploadBusy(false);
    }
  }

  async function generateCreative() {
    setCreativeBusy(true);
    setError(null);
    try {
      const res = await fetch("/ads/api/creative/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          placement,
          campaignName: name,
          linkUrl,
          existing: {
            headline,
            body,
            ctaText,
            linkUrl,
          },
          targeting: {
            industries: dedupe(industries),
            businessModels: dedupe(businessModels),
            locations: dedupe(locations),
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Generate failed"));

      if (typeof json?.headline === "string") setHeadline(json.headline);
      if (typeof json?.body === "string") setBody(json.body);
      if (typeof json?.ctaText === "string") setCtaText(json.ctaText);
      if (typeof json?.linkUrl === "string" && json.linkUrl) setLinkUrl(json.linkUrl);
    } catch (err: any) {
      setError(String(err?.message || "Generate failed"));
    } finally {
      setCreativeBusy(false);
    }
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);

    try {
      const dailyBudgetCents = usdToCents(dailyBudgetUsd);
      if (!Number.isFinite(dailyBudgetCents) || dailyBudgetCents < 0) throw new Error("Invalid daily budget");

      const res = await fetch("/ads/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          startAtIso: startAt ? new Date(startAt).toISOString() : null,
          endAtIso: endAt ? new Date(endAt).toISOString() : null,
          budget: { dailyBudgetCents },
          targeting: {
            industries: dedupe(industries),
            businessModels: dedupe(businessModels),
            locations: dedupe(locations),
          },
          creative: {
            headline,
            body,
            ctaText,
            linkUrl,
            mediaUrl: mediaUrl || null,
            mediaKind: mediaKind || null,
            mediaFit,
            mediaPosition,
            sidebarImageHeight,
            topBannerImageSize,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Create failed"));

      router.push("/ads/app");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message || "Create failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100">
            <div className="p-6">
              <div className="text-sm font-semibold text-zinc-900">Basics</div>
              <div className="mt-4 grid gap-4">
                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Campaign name</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Start</div>
                    <LocalDateTimePicker
                      value={startAt}
                      onChange={setStartAt}
                      disablePast
                      dateFirst
                      buttonClassName="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-50"
                      placeholder="Select start"
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">End</div>
                    <LocalDateTimePicker
                      value={endAt}
                      onChange={setEndAt}
                      disablePast
                      dateFirst
                      minDateTime={startAt ? new Date(startAt) : null}
                      buttonClassName="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-50"
                      placeholder="Select end"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="text-sm font-semibold text-zinc-900">Budget</div>
              <div className="mt-2 text-sm text-zinc-600">
                You’re only charged when someone clicks. Set a daily budget and we’ll pace spend throughout the day.
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Daily budget (USD)</div>
                  <input
                    value={dailyBudgetUsd}
                    onChange={(e) => setDailyBudgetUsd(e.target.value)}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  />
                </label>
              </div>
              <div className="mt-3 text-xs text-zinc-500">Tip: start small, then scale after you see performance.</div>
            </div>

            <div className="p-6">
              <div className="text-sm font-semibold text-zinc-900">Targeting</div>
              <div className="mt-2 text-sm text-zinc-600">Choose who you want to reach.</div>

              <div className="mt-5 grid gap-6">
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Audience profile</div>
                      <div className="mt-1 text-xs text-zinc-500">Save and reuse targeting presets.</div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <PortalListboxDropdown
                      value={audienceId}
                      onChange={(v) => setAudienceId(v)}
                      disabled={audienceBusy || busy}
                      placeholder="No profile"
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none hover:bg-zinc-50 focus:border-[color:var(--color-brand-blue)] disabled:opacity-60"
                      options={[
                        { value: "", label: "No profile" },
                        ...audiences.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                    />

                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={audienceName}
                        onChange={(e) => setAudienceName(e.target.value)}
                        placeholder="Save current targeting as…"
                        disabled={audienceBusy || busy}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:opacity-60 sm:col-span-2"
                      />
                      <button
                        type="button"
                        onClick={() => void saveAudience()}
                        disabled={audienceBusy || busy}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        {audienceBusy ? "Saving…" : "Save"}
                      </button>
                    </div>

                    {audienceId ? (
                      <button
                        type="button"
                        onClick={() => void deleteAudience()}
                        disabled={audienceBusy || busy}
                        className="text-left text-xs font-semibold text-red-700 hover:text-red-800 disabled:opacity-60"
                      >
                        Delete selected profile
                      </button>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Industries</div>
                  <div className="mt-2">
                    <PortalMultiSelectDropdown
                      label="Industries"
                      value={industries}
                      onChange={setIndustries}
                      disabled={busy || audienceBusy}
                      placeholder="Search industries…"
                      options={INDUSTRY_SUGGESTIONS.map((x) => ({ value: x, label: x }))}
                    />
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Optional. Add custom industries if needed.</div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Business models</div>
                  <div className="mt-2">
                    <PortalMultiSelectDropdown
                      label="Business models"
                      value={businessModels}
                      onChange={setBusinessModels}
                      disabled={busy || audienceBusy}
                      placeholder="Search business models…"
                      options={BUSINESS_MODEL_SUGGESTIONS.map((x) => ({ value: x, label: x }))}
                    />
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Optional. Add custom business models if needed.</div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Locations</div>
                  <div className="mt-2">
                    <PortalMultiSelectDropdown
                      label="Locations"
                      value={locations}
                      onChange={setLocations}
                      disabled={busy || audienceBusy}
                      placeholder="Type a city, state, or region…"
                      options={[]}
                      allowCustom
                    />
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Optional. Example: Charlotte, NC.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Account</div>
              <div className="mt-1 text-xs text-zinc-500">Manage funds and auto-reload in Settings.</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-zinc-900">${(balanceCents / 100).toFixed(2)}</div>
              <div className="mt-1 text-xs text-zinc-500">{accountBusy ? "Loading…" : "USD"}</div>
            </div>
          </div>

          <div className="mt-4">
            <Link
              href="/ads/app/settings"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Settings
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900">Creative</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHowItWorks((v) => !v)}
                disabled={busy}
                className={
                  "inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 " +
                  (showHowItWorks ? "border-[color:var(--color-brand-blue)]/30" : "border-zinc-200")
                }
                aria-label={showHowItWorks ? "Hide how it works" : "Show how it works"}
                title={showHowItWorks ? "Hide how it works" : "Show how it works"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path d="M12 10.5v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M12 7.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => void generateCreative()}
                disabled={creativeBusy || busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[color:var(--color-brand-blue)] to-[color:var(--color-brand-pink)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 2l1.2 5.1L18 9l-4.8 1.9L12 16l-1.2-5.1L6 9l4.8-1.9L12 2Z"
                    fill="currentColor"
                    opacity="0.95"
                  />
                  <path
                    d="M19 13l.7 2.7L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-1.3L19 13Z"
                    fill="currentColor"
                    opacity="0.75"
                  />
                </svg>
                <span>{creativeBusy ? "Generating…" : "Generate"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeadline("");
                  setBody("");
                  setCtaText("");
                }}
                disabled={creativeBusy || busy}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                Clear
              </button>
            </div>
          </div>

          {showHowItWorks ? (
            <div className="mt-4 rounded-2xl border border-[color:var(--color-brand-blue)]/20 bg-[color:var(--color-brand-blue)]/5 p-4 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">How “Generate” works</div>
              <div className="mt-2 space-y-1">
                <div>• It uses your campaign details + targeting to suggest copy.</div>
                <div>• If you already typed a headline/body/CTA, it will improve what you wrote (not ignore it).</div>
                <div>• You can click Generate multiple times to see options, then tweak by hand.</div>
                <div>• Media is never edited; it only affects how your ad renders.</div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4">
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Headline</div>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Example: “Book more jobs this week”"
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
              />
            </label>

            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Body</div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="What do you offer, and why should they click?"
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">CTA text</div>
                <input
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="Example: “Get a quote”"
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
                />
              </label>

              <label className="block">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Link (https or /path)</div>
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://… or /book"
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
                />
              </label>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Media</div>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSelectedFileName(f.name);
                      uploadFile(f);
                    }
                  }}
                  disabled={uploadBusy}
                  className="hidden"
                />
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadBusy}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {uploadBusy ? "Uploading…" : "Choose file"}
                  </button>
                  <div className="min-w-0 text-xs text-zinc-500">
                    {mediaUrl ? "Uploaded" : selectedFileName ? selectedFileName : "PNG, JPG, MP4"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMediaUrl("");
                    setMediaKind("");
                    setSelectedFileName("");
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Clear
                </button>
              </div>
              <div className="mt-2 text-xs text-zinc-500">Use fit + focus to control how the media crops in each preview.</div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fit</div>
                  <div className="mt-2">
                    <PortalListboxDropdown
                      value={mediaFit}
                      onChange={(v) => setMediaFit(v as any)}
                      options={[
                        { value: "cover", label: "Cover (crop)" },
                        { value: "contain", label: "Contain" },
                      ]}
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus:border-[color:var(--color-brand-blue)]"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Focus</div>
                  <div className="mt-2">
                    <PortalListboxDropdown
                      value={mediaPosition}
                      onChange={(v) => setMediaPosition(v)}
                      options={[
                        { value: "50% 50%", label: "Center" },
                        { value: "50% 0%", label: "Top" },
                        { value: "50% 100%", label: "Bottom" },
                        { value: "0% 50%", label: "Left" },
                        { value: "100% 50%", label: "Right" },
                      ]}
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus:border-[color:var(--color-brand-blue)]"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kind</div>
                  <div className="mt-2">
                    <PortalListboxDropdown
                      value={mediaKind || ""}
                      onChange={(v) => setMediaKind((v as any) || "")}
                      options={[
                        { value: "", label: "Auto" },
                        { value: "image", label: "Image" },
                        { value: "video", label: "Video" },
                      ]}
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus:border-[color:var(--color-brand-blue)]"
                    />
                  </div>
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sidebar image height</div>
                  <input
                    type="range"
                    min={60}
                    max={240}
                    value={sidebarImageHeight}
                    onChange={(e) => setSidebarImageHeight(Number(e.target.value))}
                    className="mt-3 w-full"
                  />
                  <div className="mt-1 text-xs text-zinc-500">{sidebarImageHeight}px</div>
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Top banner image size</div>
                  <input
                    type="range"
                    min={40}
                    max={160}
                    value={topBannerImageSize}
                    onChange={(e) => setTopBannerImageSize(Number(e.target.value))}
                    className="mt-3 w-full"
                  />
                  <div className="mt-1 text-xs text-zinc-500">{topBannerImageSize}px</div>
                </label>
              </div>
            </div>
          </div>

          {error ? <div className="mt-5 text-sm font-semibold text-red-600">{error}</div> : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={onSubmit}
              disabled={busy}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create campaign"}
            </button>

            <button
              type="button"
              onClick={() => {
                router.push("/ads/app");
              }}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Rendering</div>
              <div className="mt-2 text-sm text-zinc-600">
                Approximate examples (final styling can vary). {showAllPreviews ? "Showing multiple formats." : "Showing one format."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAllPreviews((v) => !v)}
              disabled={busy}
              className={
                "inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 " +
                (showAllPreviews ? "border-[color:var(--color-brand-blue)]/30" : "border-zinc-200")
              }
              aria-pressed={showAllPreviews}
              aria-label={showAllPreviews ? "Showing multiple formats" : "Showing one format"}
              title={showAllPreviews ? "Showing multiple formats" : "Showing one format"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              <span>{showAllPreviews ? "Multiple formats" : "One format"}</span>
            </button>
          </div>

          {(
            showAllPreviews
              ? ([
                  { id: "POPUP_CARD", label: "Popup card" },
                  { id: "SIDEBAR_BANNER", label: "Sidebar banner" },
                  { id: "TOP_BANNER", label: "Top banner" },
                  { id: "BILLING_SPONSORED", label: "Billing sponsored (preview)" },
                  { id: "FULLSCREEN_REWARD", label: "Fullscreen reward (preview)" },
                ] as const)
              : ([{ id: "POPUP_CARD", label: "Popup card" }] as const)
          ).map((p) => {
            const previewPlacement = p.id as any;
            const imageHeight =
              previewPlacement === "SIDEBAR_BANNER"
                ? sidebarImageHeight
                : previewPlacement === "TOP_BANNER"
                  ? Math.max(80, Math.min(220, topBannerImageSize + 64))
                  : previewPlacement === "FULLSCREEN_REWARD"
                    ? 220
                    : 160;

            return (
              <div key={p.id} className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{p.label}</div>
                  {p.id === "BILLING_SPONSORED" || p.id === "FULLSCREEN_REWARD" ? (
                    <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                      Preview only
                    </div>
                  ) : null}
                </div>

                <div className="mt-2 text-sm font-semibold text-zinc-900">{headline || "Headline"}</div>
                {body ? <div className="mt-1 text-sm text-zinc-600">{body}</div> : null}

                {mediaUrl ? (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white" style={{ height: imageHeight }}>
                    {mediaKind === "video" ? (
                      <video
                        src={mediaUrl}
                        muted
                        playsInline
                        controls
                        className="h-full w-full"
                        style={{ objectFit: mediaFit, objectPosition: mediaPosition }}
                      />
                    ) : (
                      <div className="relative h-full w-full">
                        <Image
                          src={mediaUrl}
                          alt=""
                          fill
                          sizes="(max-width: 1024px) 100vw, 800px"
                          className="h-full w-full"
                          style={{ objectFit: mediaFit, objectPosition: mediaPosition }}
                          unoptimized
                        />
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-4">
                  <div className="inline-flex items-center justify-center rounded-full bg-[color:var(--color-brand-blue)] px-4 py-2 text-xs font-semibold text-white">
                    {ctaText || "CTA"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AppConfirmModal
        open={Boolean(deleteAudienceModal)}
        title="Delete audience profile"
        message={deleteAudienceModal ? `Delete “${deleteAudienceModal.name}”? This cannot be undone.` : ""}
        destructive
        confirmLabel={audienceBusy ? "Deleting…" : "Delete"}
        onClose={() => {
          if (audienceBusy) return;
          setDeleteAudienceModal(null);
        }}
        onConfirm={() => void confirmDeleteAudience()}
      />
    </div>
  );
}
