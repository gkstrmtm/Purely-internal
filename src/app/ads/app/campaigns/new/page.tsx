"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BUSINESS_MODEL_SUGGESTIONS, INDUSTRY_SUGGESTIONS } from "@/lib/portalOnboardingWizardCatalog";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

type Bucket = { id: string; name: string; description: string | null };
type Audience = { id: string; name: string; targetingJson: any };

function usdToCents(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return Math.max(0, Math.round(n * 100));
}

function toggle(list: string[], value: string) {
  const v = value.trim();
  if (!v) return list;
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("My campaign");
  const [placement, setPlacement] = useState<"SIDEBAR_BANNER" | "TOP_BANNER" | "POPUP_CARD">("POPUP_CARD");

  const [startAt, setStartAt] = useState<string>("");
  const [endAt, setEndAt] = useState<string>("");

  const [dailyBudgetUsd, setDailyBudgetUsd] = useState("50.00");

  const [industries, setIndustries] = useState<string[]>([]);
  const [businessModels, setBusinessModels] = useState<string[]>([]);
  const [serviceMatch, setServiceMatch] = useState<"ANY" | "ALL">("ANY");
  const [serviceSlugs, setServiceSlugs] = useState<string[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [bucketIds, setBucketIds] = useState<string[]>([]);

  const [customIndustry, setCustomIndustry] = useState("");
  const [customBusinessModel, setCustomBusinessModel] = useState("");

  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [linkUrl, setLinkUrl] = useState("https://purelyautomation.com");
  const [creativeBusy, setCreativeBusy] = useState(false);

  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "">("");
  const [mediaFit, setMediaFit] = useState<"cover" | "contain">("cover");
  const [mediaPosition, setMediaPosition] = useState("50% 50%");
  const [sidebarImageHeight, setSidebarImageHeight] = useState<number>(140);
  const [topBannerImageSize, setTopBannerImageSize] = useState<number>(96);

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audienceId, setAudienceId] = useState<string>("");
  const [audienceName, setAudienceName] = useState<string>("");
  const [audienceBusy, setAudienceBusy] = useState(false);

  const [me, setMe] = useState<any>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  const balanceCents = Number(me?.account?.balanceCents || 0);

  const selectableServices = useMemo(
    () => PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => ({ slug: s.slug, title: s.title })),
    [],
  );

  useEffect(() => {
    fetch("/ads/api/targeting-buckets")
      .then((r) => r.json())
      .then((j) => setBuckets(Array.isArray(j?.buckets) ? j.buckets : []))
      .catch(() => setBuckets([]));
  }, []);

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
    const any = dedupe(Array.isArray(t.serviceSlugsAny) ? t.serviceSlugsAny : []);
    const all = dedupe(Array.isArray(t.serviceSlugsAll) ? t.serviceSlugsAll : []);
    if (all.length) {
      setServiceMatch("ALL");
      setServiceSlugs(all);
    } else {
      setServiceMatch("ANY");
      setServiceSlugs(any);
    }
    setBucketIds(dedupe(Array.isArray(t.bucketIds) ? t.bucketIds : []));
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
            serviceSlugsAny: serviceMatch === "ANY" ? dedupe(serviceSlugs) : [],
            serviceSlugsAll: serviceMatch === "ALL" ? dedupe(serviceSlugs) : [],
            bucketIds: dedupe(bucketIds),
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
    if (!confirm(`Delete audience profile “${a.name}”?`)) return;

    setAudienceBusy(true);
    setError(null);
    try {
      const res = await fetch(`/ads/api/audiences/${audienceId}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Delete failed"));
      setAudienceId("");
      await loadAudiences();
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
          targeting: {
            industries: dedupe(industries),
            businessModels: dedupe(businessModels),
            serviceMatch,
            serviceSlugs: dedupe(serviceSlugs),
            bucketIds: dedupe(bucketIds),
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
          placement,
          startAtIso: startAt ? new Date(startAt).toISOString() : null,
          endAtIso: endAt ? new Date(endAt).toISOString() : null,
          budget: { dailyBudgetCents },
          targeting: {
            industries: dedupe(industries),
            businessModels: dedupe(businessModels),
            serviceSlugsAny: serviceMatch === "ANY" ? dedupe(serviceSlugs) : [],
            serviceSlugsAll: serviceMatch === "ALL" ? dedupe(serviceSlugs) : [],
            bucketIds: dedupe(bucketIds),
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
                    <input
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      type="datetime-local"
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">End</div>
                    <input
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                      type="datetime-local"
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="text-sm font-semibold text-zinc-900">Placement</div>
              <div className="mt-4 grid gap-2">
                {(
                  [
                    { id: "POPUP_CARD", label: "Popup card" },
                    { id: "SIDEBAR_BANNER", label: "Sidebar banner" },
                    { id: "TOP_BANNER", label: "Top banner" },
                  ] as const
                ).map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3"
                  >
                    <div className="text-sm font-semibold text-zinc-900">{p.label}</div>
                    <input type="radio" name="placement" checked={placement === p.id} onChange={() => setPlacement(p.id)} />
                  </label>
                ))}
              </div>
            </div>

            <div className="p-6">
              <div className="text-sm font-semibold text-zinc-900">Budget</div>
              <div className="mt-2 text-sm text-zinc-600">
                You’re charged on click. CPC is optimized internally, you only set a daily budget.
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
                    <select
                      value={audienceId}
                      onChange={(e) => setAudienceId(e.target.value)}
                      disabled={audienceBusy || busy}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:opacity-60"
                    >
                      <option value="">— No profile —</option>
                      {audiences.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>

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
                  <div className="mt-3 flex flex-wrap gap-2">
                    {INDUSTRY_SUGGESTIONS.map((x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => setIndustries((cur) => toggle(cur, x))}
                        className={
                          industries.includes(x)
                            ? "rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white"
                            : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        }
                      >
                        {x}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={customIndustry}
                      onChange={(e) => setCustomIndustry(e.target.value)}
                      placeholder="Add industry…"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = customIndustry.trim();
                        if (!v) return;
                        setIndustries((cur) => dedupe([...cur, v]));
                        setCustomIndustry("");
                      }}
                      className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Business models</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BUSINESS_MODEL_SUGGESTIONS.map((x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => setBusinessModels((cur) => toggle(cur, x))}
                        className={
                          businessModels.includes(x)
                            ? "rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white"
                            : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        }
                      >
                        {x}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={customBusinessModel}
                      onChange={(e) => setCustomBusinessModel(e.target.value)}
                      placeholder="Add business model…"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = customBusinessModel.trim();
                        if (!v) return;
                        setBusinessModels((cur) => dedupe([...cur, v]));
                        setCustomBusinessModel("");
                      }}
                      className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Add
                    </button>
                  </div>
                </div>

            <div className="rounded-2xl bg-zinc-50 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Services</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Choose which services the viewer must have unlocked to see this ad.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setServiceMatch("ANY")}
                    className={
                      "rounded-2xl px-3 py-2 text-xs font-semibold " +
                      (serviceMatch === "ANY"
                        ? "bg-brand-ink text-white"
                        : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                  >
                    Match any
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceMatch("ALL")}
                    className={
                      "rounded-2xl px-3 py-2 text-xs font-semibold " +
                      (serviceMatch === "ALL"
                        ? "bg-brand-ink text-white"
                        : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                  >
                    Match all
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <input
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Search services…"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </div>

              <div className="mt-3 max-h-64 overflow-auto rounded-2xl border border-zinc-200">
                {selectableServices
                  .filter((s) => {
                    const q = serviceSearch.trim().toLowerCase();
                    if (!q) return true;
                    return s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q);
                  })
                  .map((s) => (
                    <label
                      key={s.slug}
                      className="flex cursor-pointer items-center justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{s.title}</div>
                        <div className="truncate text-xs text-zinc-500">{s.slug}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={serviceSlugs.includes(s.slug)}
                        onChange={() => setServiceSlugs((cur) => toggle(cur, s.slug))}
                      />
                    </label>
                  ))}
              </div>

              <div className="mt-2 text-xs text-zinc-500">
                {serviceMatch === "ANY"
                  ? "Match any: the viewer must have at least one selected service unlocked."
                  : "Match all: the viewer must have every selected service unlocked."}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Targeting buckets</div>
              <div className="mt-1 text-xs text-zinc-500">Buckets target portal users by context (example: “new lead”, “payment due”).</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {buckets.map((b) => (
                  <label key={b.id} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-2">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{b.name}</div>
                      {b.description ? <div className="mt-0.5 text-xs text-zinc-500">{b.description}</div> : null}
                    </div>
                    <input
                      type="checkbox"
                      checked={bucketIds.includes(b.id)}
                      onChange={() => setBucketIds((cur) => toggle(cur, b.id))}
                    />
                  </label>
                ))}

                {buckets.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 sm:col-span-2">
                    No buckets configured yet.
                  </div>
                ) : null}
              </div>
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
                onClick={() => void generateCreative()}
                disabled={creativeBusy || busy}
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {creativeBusy ? "Generating…" : "Generate"}
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
              <div className="mt-2 text-xs text-zinc-500">Use fit + focus to control how the media crops in each placement.</div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fit</div>
                  <select
                    value={mediaFit}
                    onChange={(e) => setMediaFit(e.target.value as any)}
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  >
                    <option value="cover">Cover (crop)</option>
                    <option value="contain">Contain</option>
                  </select>
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Focus</div>
                  <select
                    value={mediaPosition}
                    onChange={(e) => setMediaPosition(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  >
                    <option value="50% 50%">Center</option>
                    <option value="50% 0%">Top</option>
                    <option value="50% 100%">Bottom</option>
                    <option value="0% 50%">Left</option>
                    <option value="100% 50%">Right</option>
                  </select>
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kind</div>
                  <select
                    value={mediaKind || ""}
                    onChange={(e) => setMediaKind((e.target.value as any) || "")}
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  >
                    <option value="">Auto</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                  </select>
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
              className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
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
          <div className="text-sm font-semibold text-zinc-900">Rendering</div>
          <div className="mt-2 text-sm text-zinc-600">Approximate example (final styling can vary by placement).</div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{placement}</div>
            <div className="mt-2 text-sm font-semibold text-zinc-900">{headline || "Headline"}</div>
            {body ? <div className="mt-1 text-sm text-zinc-600">{body}</div> : null}

            {mediaUrl ? (
              <div
                className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white"
                style={{ height: placement === "SIDEBAR_BANNER" ? sidebarImageHeight : 160 }}
              >
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
              <div className="inline-flex items-center justify-center rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white">
                {ctaText || "CTA"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
