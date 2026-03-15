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
  };
};

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
  const showImage = Boolean(v.mediaUrl) && (v.mediaKind ?? "image") === "image";
  const size = Math.max(40, Math.min(96, Math.floor(Number(v.topBannerImageSize ?? 56) || 56)));

  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-4">
        <a
          href={clickHref}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-3xl border border-brand-ink/10 bg-gradient-to-r from-[color:var(--color-brand-blue)]/10 via-white to-white p-4 hover:opacity-95"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {showImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={String(v.mediaUrl)}
                  alt=""
                  className="shrink-0 rounded-2xl border border-zinc-200 object-cover"
                  style={{
                    height: size,
                    width: size,
                    objectFit: v.mediaFit ?? "cover",
                    objectPosition: v.mediaPosition ?? "center",
                  }}
                />
              ) : null}
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sponsored</div>
                <div className="truncate text-sm font-semibold text-zinc-900">{v.headline || "Sponsored"}</div>
                {v.body ? <div className="mt-1 line-clamp-2 text-xs text-zinc-700">{v.body}</div> : null}
              </div>
            </div>
            <div className="inline-flex shrink-0 rounded-2xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white">
              {v.ctaText || "Learn"}
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}
