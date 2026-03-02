import Link from "next/link";
import Image from "next/image";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";
import { CampaignToggleButton } from "./CampaignToggleButton";
import { AdsCampaignEditorClient } from "./AdsCampaignEditorClient";

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export default async function AdsCampaignDetailsPage(props: { params: Promise<{ campaignId: string }> }) {
  const user = await requireAdsUser();
  const { campaignId } = await props.params;

  const campaign = await prisma.portalAdCampaign.findFirst({
    where: { id: campaignId, createdById: user.id },
    select: {
      id: true,
      name: true,
      enabled: true,
      reviewStatus: true,
      reviewedAt: true,
      reviewNotes: true,
      placement: true,
      startAt: true,
      endAt: true,
      targetJson: true,
      creativeJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!campaign) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-8">
        <div className="text-lg font-bold text-zinc-900">Campaign not found</div>
        <div className="mt-2 text-sm text-zinc-600">This campaign may have been deleted or you don’t have access.</div>
        <Link
          href="/ads/app"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const reviewStatus = campaign.reviewStatus;
  const isPending = reviewStatus === "PENDING";
  const isRejected = reviewStatus === "REJECTED";

  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const billing = (campaign.targetJson as any)?.billing ?? null;
  const dailyBudgetCents = Number(billing?.dailyBudgetCents || 0);

  const creative = (campaign.creativeJson as any) ?? {};
  const headline = String(creative?.headline || "").trim();
  const body = String(creative?.body || "").trim();
  const ctaText = String(creative?.ctaText || "").trim();
  const linkUrl = String(creative?.linkUrl || "").trim();
  const mediaUrl = String(creative?.mediaUrl || "").trim();
  const mediaKind = String(creative?.mediaKind || "").trim();
  const mediaFit = String(creative?.mediaFit || "cover").trim() || "cover";
  const mediaPosition = String(creative?.mediaPosition || "50% 50%").trim() || "50% 50%";

  const [impressions7d, clicks7d, spendToday, spend7d, spend30d, chargedClicks7d] = await Promise.all([
    prisma.portalAdCampaignEvent
      .count({
        where: {
          campaignId: campaign.id,
          kind: "IMPRESSION",
          createdAt: { gte: sevenDaysAgo },
          metaJson: { path: ["action"], equals: "IMPRESSION" } as any,
        },
      })
      .catch(() => 0),
    prisma.portalAdCampaignEvent
      .count({
        where: {
          campaignId: campaign.id,
          kind: "IMPRESSION",
          createdAt: { gte: sevenDaysAgo },
          metaJson: { path: ["action"], equals: "CLICK" } as any,
        },
      })
      .catch(() => 0),
    prisma.adsAdvertiserLedgerEntry
      .aggregate({
        where: { campaignId: campaign.id, kind: "SPEND", createdAt: { gte: todayStart } },
        _sum: { amountCents: true },
      })
      .catch(() => null),
    prisma.adsAdvertiserLedgerEntry
      .aggregate({
        where: { campaignId: campaign.id, kind: "SPEND", createdAt: { gte: sevenDaysAgo } },
        _sum: { amountCents: true },
      })
      .catch(() => null),
    prisma.adsAdvertiserLedgerEntry
      .aggregate({
        where: { campaignId: campaign.id, kind: "SPEND", createdAt: { gte: thirtyDaysAgo } },
        _sum: { amountCents: true },
      })
      .catch(() => null),
    prisma.adsAdvertiserLedgerEntry
      .count({ where: { campaignId: campaign.id, kind: "SPEND", createdAt: { gte: sevenDaysAgo } } })
      .catch(() => 0),
  ]);

  const spendTodayCents = Number(spendToday?._sum?.amountCents || 0);
  const spend7dCents = Number(spend7d?._sum?.amountCents || 0);
  const spend30dCents = Number(spend30d?._sum?.amountCents || 0);

  const ctr7d = impressions7d > 0 ? (clicks7d / impressions7d) * 100 : 0;
  const avgCpc7dCents = chargedClicks7d > 0 ? Math.round(spend7dCents / chargedClicks7d) : 0;

  const campaignForEditor = {
    id: campaign.id,
    name: campaign.name,
    placement: campaign.placement as any,
    enabled: campaign.enabled,
    reviewStatus: campaign.reviewStatus,
    startAtIso: campaign.startAt ? campaign.startAt.toISOString() : null,
    endAtIso: campaign.endAt ? campaign.endAt.toISOString() : null,
    targetJson: campaign.targetJson,
    creativeJson: campaign.creativeJson,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Campaign</div>
          <div className="mt-1 text-2xl font-bold text-zinc-900">{campaign.name}</div>
          <div className="mt-1 text-sm text-zinc-600">
            {isPending ? "Pending review" : isRejected ? "Needs changes" : "Approved"} · {campaign.enabled ? "Enabled" : "Paused"} · Updated {campaign.updatedAt.toLocaleString()}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/ads/app"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Back
          </Link>
          <CampaignToggleButton
            campaignId={campaign.id}
            enabled={campaign.enabled}
            reviewStatus={campaign.reviewStatus}
            reviewNotes={campaign.reviewNotes}
          />
        </div>
      </div>

      {isPending ? (
        <div className="rounded-3xl border border-[color:var(--color-brand-blue)]/20 bg-[color:var(--color-brand-blue)]/5 p-5">
          <div className="text-sm font-semibold text-zinc-900">Pending approval</div>
          <div className="mt-1 text-sm text-zinc-700">
            Your campaign won’t go live until it’s reviewed and approved.
          </div>
        </div>
      ) : null}

      {isRejected ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5">
          <div className="text-sm font-semibold text-rose-900">Changes requested</div>
          <div className="mt-1 text-sm text-rose-800">
            {campaign.reviewNotes ? `Manager notes: ${campaign.reviewNotes}` : "A manager asked for updates before approving this campaign."}
          </div>
        </div>
      ) : null}

      <AdsCampaignEditorClient campaign={campaignForEditor} />

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Spend (7d)</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{usd(spend7dCents)}</div>
          <div className="mt-2 text-sm text-zinc-600">{usd(spendTodayCents)} today</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Impressions (7d)</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{impressions7d.toLocaleString()}</div>
          <div className="mt-2 text-sm text-zinc-600">Clicks: {clicks7d.toLocaleString()}</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">CTR (7d)</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{ctr7d ? `${ctr7d.toFixed(2)}%` : "—"}</div>
          <div className="mt-2 text-sm text-zinc-600">Charged clicks: {chargedClicks7d.toLocaleString()}</div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Avg CPC (7d)</div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">{avgCpc7dCents ? usd(avgCpc7dCents) : "—"}</div>
          <div className="mt-2 text-sm text-zinc-600">Spend (30d): {usd(spend30dCents)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Budget</div>
          <div className="mt-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Daily budget</div>
              <div className="mt-2 text-lg font-bold text-zinc-900">{dailyBudgetCents ? usd(dailyBudgetCents) : "—"}</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-zinc-500">
            You’re charged when someone clicks your ad. Your daily budget is the max we’ll spend per day.
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Creative preview</div>
          <div className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white">
            {mediaUrl ? (
              <div className="relative h-48 w-full bg-zinc-50">
                {mediaKind === "video" ? (
                  <video
                    src={mediaUrl}
                    muted
                    playsInline
                    controls
                    className="h-full w-full"
                    style={{ objectFit: mediaFit as any, objectPosition: mediaPosition }}
                  />
                ) : (
                  <Image
                    src={mediaUrl}
                    alt="Creative"
                    fill
                    sizes="(max-width: 1024px) 100vw, 800px"
                    className="h-full w-full"
                    style={{ objectFit: mediaFit as any, objectPosition: mediaPosition }}
                    unoptimized
                  />
                )}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center bg-zinc-50 text-sm text-zinc-500">No media</div>
            )}
            <div className="p-5">
              <div className="text-sm font-semibold text-zinc-900">{headline || "(No headline)"}</div>
              {body ? <div className="mt-2 text-sm text-zinc-600">{body}</div> : null}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {linkUrl ? (
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-brand-ink underline"
                  >
                    {linkUrl}
                  </a>
                ) : (
                  <div className="text-xs text-zinc-500">No link URL</div>
                )}
                {ctaText ? (
                  <div className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-xs font-semibold text-white">
                    {ctaText}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Schedule</div>
        <div className="mt-2 text-sm text-zinc-600">
          {campaign.startAt ? `Start: ${campaign.startAt.toLocaleString()}` : "Start: Immediately"} ·{" "}
          {campaign.endAt ? `End: ${campaign.endAt.toLocaleString()}` : "End: No end date"}
        </div>
      </div>
    </div>
  );
}
