"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

export function DiscountCheckoutClient(props: { basePath: "/portal" | "/credit"; serviceSlug: string; promoCode: string | null }) {
  const title = useMemo(() => serviceTitle(props.serviceSlug), [props.serviceSlug]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const moduleKey = moduleKeyForServiceSlug(props.serviceSlug);
      const promoCode = String(props.promoCode || "").trim();
      if (!moduleKey) {
        if (mounted) setError("Unknown service for discount.");
        return;
      }
      if (!promoCode) {
        if (mounted) setError("Missing promo code.");
        return;
      }

      const successPath = `${props.basePath}/app/billing?checkout=success`;
      const cancelPath = `${props.basePath}/app/billing?checkout=cancel`;

      const res = await fetch("/api/portal/billing/checkout-module", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module: moduleKey, promoCode, successPath, cancelPath }),
      }).catch(() => null);

      const body = (await res?.json().catch(() => ({}))) as any;
      if (!res?.ok || !body?.ok || typeof body?.url !== "string") {
        const msg = String(body?.error || "Unable to start checkout");
        if (mounted) setError(msg);
        return;
      }

      window.location.href = body.url;
    })();

    return () => {
      mounted = false;
    };
  }, [props.basePath, props.promoCode, props.serviceSlug]);

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Discount checkout</div>
        <div className="mt-2 text-sm text-zinc-600">Applying your promo code for {title}…</div>

        {error ? (
          <>
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
            <div className="mt-4">
              <Link
                href={`${props.basePath}/app/billing`}
                className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Go to Billing
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-4 text-xs text-zinc-500">If nothing happens, make sure Stripe is configured and the promo code exists.</div>
        )}
      </div>
    </div>
  );
}
