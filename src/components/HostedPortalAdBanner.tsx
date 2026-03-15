"use client";

import { useEffect, useMemo, useState } from "react";

type Placement = "HOSTED_BLOG_PAGE" | "HOSTED_REVIEWS_PAGE";

type Campaign = {
  id: string;
  creative?: {
    headline?: string;
    body?: string;
    ctaText?: string;
    linkUrl?: string;
    mediaUrl?: string;
    mediaKind?: "image" | "video";
    mediaFit?: "cover" | "contain";
    mediaPosition?: string;
    topBannerImageSize?: number;

    // Hosted placement overrides
    hostedCardWidth?: number;
    hostedMediaAspectRatio?: "21:9" | "16:9" | "4:3" | "3:2" | "1:1";
  };
};

export type HostedPortalAdCreative = NonNullable<Campaign["creative"]>;

function clampHostedCardWidth(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 360;
  return Math.max(260, Math.min(520, Math.floor(n)));
}

function normalizeHostedAspectRatio(v: unknown): NonNullable<HostedPortalAdCreative["hostedMediaAspectRatio"]> {
  const s = typeof v === "string" ? v.trim() : "";
  if (s === "21:9" || s === "16:9" || s === "4:3" || s === "3:2" || s === "1:1") return s;
  return "16:9";
}

function aspectRatioToCss(raw: HostedPortalAdCreative["hostedMediaAspectRatio"]): string {
  const r = normalizeHostedAspectRatio(raw);
  if (r === "21:9") return "21 / 9";
  if (r === "16:9") return "16 / 9";
  if (r === "4:3") return "4 / 3";
  if (r === "3:2") return "3 / 2";
  return "1 / 1";
}

export function HostedPortalAdCard({
  creative,
  clickHref,
}: {
  creative: HostedPortalAdCreative;
  clickHref: string;
}) {
  const mediaUrl = String(creative.mediaUrl || "").trim();
  const mediaKind = creative.mediaKind === "video" ? "video" : "image";
  const hasMedia = Boolean(mediaUrl);
  const isVideo = hasMedia && mediaKind === "video";
  const isImage = hasMedia && mediaKind === "image";

  const mediaFit = creative.mediaFit ?? "cover";
  const mediaPosition = creative.mediaPosition ?? "center";

  return (
    <a
      href={clickHref}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden border border-zinc-200 bg-white shadow-xl"
      style={{ borderRadius: 12 }}
    >
      {isVideo ? (
        <div className="relative w-full bg-black" style={{ aspectRatio: aspectRatioToCss(creative.hostedMediaAspectRatio) }}>
          <video
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: mediaFit, objectPosition: mediaPosition }}
            playsInline
            preload="metadata"
            muted
            loop
            autoPlay
            src={mediaUrl}
          />
        </div>
      ) : null}

      {isImage ? (
        <div className="relative w-full bg-zinc-100" style={{ aspectRatio: aspectRatioToCss(creative.hostedMediaAspectRatio) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: mediaFit, objectPosition: mediaPosition }}
          />
        </div>
      ) : null}

      <div className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sponsored</div>
        <div className="mt-1 text-base font-semibold text-zinc-900">{creative.headline || "Sponsored"}</div>
        {creative.body ? <div className="mt-2 text-sm leading-relaxed text-zinc-700">{creative.body}</div> : null}

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">Ad</div>
          <div className="inline-flex items-center justify-center bg-zinc-900 px-4 py-2 text-xs font-semibold text-white" style={{ borderRadius: 10 }}>
            {creative.ctaText || "Learn more"}
          </div>
        </div>
      </div>
    </a>
  );
}

export function HostedPortalAdBanner({
  placement,
  siteSlug,
  domain,
  ownerId,
  pathOverride,
}: {
  placement: Placement;
  siteSlug?: string | null | undefined;
  domain?: string | null | undefined;
  ownerId?: string | null | undefined;
  pathOverride?: string | null | undefined;
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [clickUrl, setClickUrl] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        const path = (pathOverride || window.location.pathname || "").trim();
        const qs = new URLSearchParams();
        qs.set("placement", placement);
        if (path) qs.set("path", path);
        if (siteSlug) qs.set("siteSlug", String(siteSlug));
        if (domain) qs.set("domain", String(domain));
        if (ownerId) qs.set("ownerId", String(ownerId));
        const res = await fetch(`/api/public/hosted-ads/next?${qs.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as any;
        if (canceled) return;
        if (!res.ok || !json?.ok) {
          setCampaign(null);
          setClickUrl("");
          setLoaded(true);
          return;
        }
        setCampaign((json.campaign as Campaign | null) ?? null);
        setClickUrl(typeof json.clickUrl === "string" ? json.clickUrl : "");
        setLoaded(true);
      } catch {
        if (canceled) return;
        setCampaign(null);
        setClickUrl("");
        setLoaded(true);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [placement, siteSlug, domain, ownerId, pathOverride]);

  const clickHref = useMemo(() => {
    return typeof clickUrl === "string" ? clickUrl : "";
  }, [clickUrl]);

  if (!loaded) return null;
  if (!campaign?.id) return null;

  const v = campaign.creative ?? {};
  const width = clampHostedCardWidth(v.hostedCardWidth);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 sm:bottom-auto sm:right-6 sm:top-24">
      <div className="pointer-events-auto" style={{ width, maxWidth: "calc(100vw - 2rem)" }}>
        <HostedPortalAdCard creative={v as HostedPortalAdCreative} clickHref={clickHref} />
      </div>
    </div>
  );
}
