"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { LocalDateTimePicker } from "@/components/LocalDateTimePicker";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";

type Placement = "SIDEBAR_BANNER" | "TOP_BANNER" | "POPUP_CARD";

function centsToUsdString(cents: number) {
  const n = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return (n / 100).toFixed(2);
}

function usdToCents(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return Math.max(0, Math.round(n * 100));
}

function toLocalInputValue(iso: string | null) {
  const s = String(iso || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputValueToIso(value: string): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function AdsCampaignEditorClient(props: {
  campaign: {
    id: string;
    name: string;
    placement: Placement;
    enabled: boolean;
    reviewStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
    startAtIso: string | null;
    endAtIso: string | null;
    targetJson: any;
    creativeJson: any;
  };
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initialBudgetCents = Number(props.campaign?.targetJson?.billing?.dailyBudgetCents || 0);
  const initialCreative = props.campaign?.creativeJson ?? {};

  const [name, setName] = useState(props.campaign.name);
  const [startAt, setStartAt] = useState(toLocalInputValue(props.campaign.startAtIso));
  const [endAt, setEndAt] = useState(toLocalInputValue(props.campaign.endAtIso));
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState(centsToUsdString(initialBudgetCents));

  const [headline, setHeadline] = useState(String(initialCreative?.headline || ""));
  const [body, setBody] = useState(String(initialCreative?.body || ""));
  const [ctaText, setCtaText] = useState(String(initialCreative?.ctaText || ""));
  const [linkUrl, setLinkUrl] = useState(String(initialCreative?.linkUrl || ""));

  const [mediaUrl, setMediaUrl] = useState(String(initialCreative?.mediaUrl || ""));
  const [mediaKind, setMediaKind] = useState<"" | "image" | "video">((String(initialCreative?.mediaKind || "") as any) || "");
  const [mediaFit, setMediaFit] = useState<"cover" | "contain">((String(initialCreative?.mediaFit || "cover") as any) || "cover");
  const [mediaPosition, setMediaPosition] = useState(String(initialCreative?.mediaPosition || "50% 50%"));
  const [sidebarImageHeight, setSidebarImageHeight] = useState<number>(Number(initialCreative?.sidebarImageHeight || 140));
  const [topBannerImageSize, setTopBannerImageSize] = useState<number>(Number(initialCreative?.topBannerImageSize || 96));

  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseline, setBaseline] = useState<any>(null);

  const snapshot = useMemo(
    () => ({
      name,
      startAt,
      endAt,
      dailyBudgetUsd,
      headline,
      body,
      ctaText,
      linkUrl,
      mediaUrl,
      mediaKind,
      mediaFit,
      mediaPosition,
      sidebarImageHeight,
      topBannerImageSize,
    }),
    [
      name,
      startAt,
      endAt,
      dailyBudgetUsd,
      headline,
      body,
      ctaText,
      linkUrl,
      mediaUrl,
      mediaKind,
      mediaFit,
      mediaPosition,
      sidebarImageHeight,
      topBannerImageSize,
    ],
  );

  useEffect(() => {
    // Initialize baseline once.
    setBaseline((cur: any) => cur ?? snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = baseline == null ? true : JSON.stringify(snapshot) !== JSON.stringify(baseline);
  const showSaved = baseline != null && !isDirty && !saving;

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

  async function save() {
    const dailyBudgetCents = usdToCents(dailyBudgetUsd);
    if (!Number.isFinite(dailyBudgetCents) || dailyBudgetCents < 0) {
      setError("Enter a valid daily budget");
      return;
    }

    const headlineTrimmed = String(headline || "").trim();
    if (!headlineTrimmed) {
      setError("Headline is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/ads/api/campaigns/${encodeURIComponent(props.campaign.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(name || "").trim(),
          startAtIso: localInputValueToIso(startAt),
          endAtIso: localInputValueToIso(endAt),
          budget: { dailyBudgetCents },
          creative: {
            headline: headlineTrimmed,
            body: String(body || "").trim() || null,
            ctaText: String(ctaText || "").trim() || null,
            linkUrl: String(linkUrl || "").trim() || null,
            mediaUrl: String(mediaUrl || "").trim() || null,
            mediaKind: mediaKind || null,
            mediaFit: mediaFit || null,
            mediaPosition: String(mediaPosition || "").trim() || null,
            sidebarImageHeight,
            topBannerImageSize,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Save failed"));

      setBaseline(snapshot);
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Edit campaign</div>
          <div className="mt-1 text-sm text-zinc-600">
            Saving changes will pause this campaign and send it back for manager review.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !isDirty}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Saving…" : showSaved ? "Saved" : "Save changes"}
        </button>
      </div>

      {error ? <div className="mt-4 text-sm font-semibold text-red-600">{error}</div> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
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

        <div className="space-y-4">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Headline</div>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Body</div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">CTA text</div>
              <input
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
              />
            </label>
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Link</div>
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-400"
              />
            </label>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Media</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
              }}
              disabled={uploadBusy}
              className="hidden"
            />

            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadBusy}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
              >
                {uploadBusy ? "Uploading…" : "Choose file"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMediaUrl("");
                  setMediaKind("");
                }}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Clear
              </button>
              <div className="min-w-0 text-xs text-zinc-500">{mediaUrl ? "Uploaded" : "No media"}</div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                    value={mediaKind}
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

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
      </div>
    </div>
  );
}
