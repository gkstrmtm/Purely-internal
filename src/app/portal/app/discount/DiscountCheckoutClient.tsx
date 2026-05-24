"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

type PortalModuleKey =
  | "blog"
  | "booking"
  | "automations"
  | "reviews"
  | "newsletter"
  | "nurture"
  | "aiReceptionist"
  | "leadScraping"
  | "leadOutbound"
  | "crm";

function moduleKeyForServiceSlug(serviceSlug: string): PortalModuleKey | null {
  const s = String(serviceSlug || "").trim();
  if (!s) return null;

  if (s === "blog" || s === "blogs") return "blog";
  if (s === "booking") return "booking";
  if (s === "automations") return "automations";
  if (s === "reviews") return "reviews";
  if (s === "newsletter") return "newsletter";
  if (s === "nurture" || s === "nurture-campaigns") return "nurture";
  if (s === "aiReceptionist" || s === "ai-receptionist") return "aiReceptionist";
  if (s === "leadScraping" || s === "lead-scraping") return "leadScraping";
  if (s === "leadOutbound" || s === "ai-outbound-calls") return "leadOutbound";
  if (s === "crm" || s === "follow-up") return "crm";

  return null;
}

function serviceTitle(serviceSlug: string) {
  const s = String(serviceSlug || "").trim();
  const svc = PORTAL_SERVICES.find((x) => x.slug === s) ?? null;
  return svc?.title ?? "Service";
}

export function DiscountCheckoutClient(props: {
  basePath: "/portal" | "/credit";
  serviceSlug: string;
  promoCode: string | null;
  campaignId?: string | null;
}) {
  const title = useMemo(() => serviceTitle(props.serviceSlug), [props.serviceSlug]);
  const [error, setError] = useState<string | null>(null);

  const startDiscountCheckout = useCallback(async () => {
    setError(null);

    const moduleKey = moduleKeyForServiceSlug(props.serviceSlug);
    const promoCode = String(props.promoCode || "").trim();
    const campaignId = String(props.campaignId || "").trim();
    if (!moduleKey) {
      setError("Discount checkout is not set up for this service yet.");
      return;
    }
    if (!promoCode && !campaignId) {
      setError("Add a promo code or campaign before starting checkout.");
      return;
    }

    const successPath = `${props.basePath}/app/billing?checkout=success`;
    const cancelPath = `${props.basePath}/app/billing?checkout=cancel`;

    const res = await fetch("/api/portal/billing/checkout-module", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module: moduleKey, promoCode: promoCode || undefined, campaignId: campaignId || undefined, serviceSlug: props.serviceSlug, successPath, cancelPath }),
    }).catch(() => null);

    const body = (await res?.json().catch(() => ({}))) as any;
    if (!res?.ok || !body?.ok || typeof body?.url !== "string") {
      setError(String(body?.error || "Discount checkout did not start. Retry here, go to billing, or ask Pura to help."));
      return;
    }

    window.location.href = body.url;
  }, [props.basePath, props.campaignId, props.promoCode, props.serviceSlug]);

  useEffect(() => {
    void startDiscountCheckout();
  }, [startDiscountCheckout]);

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Discount checkout</div>
        <div className="mt-2 text-sm text-zinc-600">Applying your discount for {title}…</div>

        {error ? (
          <>
            <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="font-semibold text-red-900">Discount checkout needs attention</div>
              <div className="mt-1">{error}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void startDiscountCheckout();
                  }}
                  className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Retry
                </button>
                <Link
                  href={`${props.basePath}/app/ai-chat?onboarding=1`}
                  className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                >
                  Ask Pura
                </Link>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`${props.basePath}/app/billing`}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Go to Billing
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-4 text-xs text-zinc-500">If nothing happens, make sure Stripe is configured.</div>
        )}
      </div>
    </div>
  );
}
