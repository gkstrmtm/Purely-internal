import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

export const dynamic = "force-dynamic";

function uniq(xs: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of xs) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function serviceMeta(serviceSlug: string) {
  const slug = String(serviceSlug || "").trim();
  const service = PORTAL_SERVICES.find((item) => item.slug === slug) ?? null;
  return {
    title: service?.title ?? slug,
    description: service?.description ?? "Apply this discount to continue to secure checkout.",
  };
}

export default async function PortalDiscountChooserPage({
  searchParams,
}: {
  searchParams: Promise<{ promoCode?: string; services?: string; campaignId?: string }>;
}) {
  const headerList = await headers();
  const portalBase = headerList.get("x-portal-variant") === "credit" ? "/credit" : "/portal";
  const appBase = `${portalBase}/app`;
  const sp = await searchParams;
  const promoCode = typeof sp?.promoCode === "string" ? sp.promoCode.trim() : "";
  const campaignId = typeof sp?.campaignId === "string" ? sp.campaignId.trim() : "";
  const servicesRaw = typeof sp?.services === "string" ? sp.services : "";
  const serviceSlugs = uniq(servicesRaw.split(",")).slice(0, 20);

  if (serviceSlugs.length === 1 && (promoCode || campaignId)) {
    const qs = new URLSearchParams();
    if (promoCode) qs.set("promoCode", promoCode);
    if (campaignId) qs.set("campaignId", campaignId);
    redirect(`${appBase}/discount/${encodeURIComponent(serviceSlugs[0] || "")}?${qs.toString()}`);
  }

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Choose a service</div>
        <div className="mt-2 text-sm text-zinc-600">Select which service to apply your discount to.</div>

        {!promoCode && !campaignId ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Missing discount details.
          </div>
        ) : null}

        {serviceSlugs.length ? (
          <div className="mt-4 grid gap-2">
            {serviceSlugs.map((slug) => {
              const meta = serviceMeta(slug);
              const qs = new URLSearchParams();
              if (promoCode) qs.set("promoCode", promoCode);
              if (campaignId) qs.set("campaignId", campaignId);
              const href = `${appBase}/discount/${encodeURIComponent(slug)}?${qs.toString()}`;
              return (
                <Link
                  key={slug}
                  href={href}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="text-sm font-semibold text-zinc-900">{meta.title}</div>
                  <div className="mt-1 text-xs text-zinc-600">{meta.description}</div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            No eligible services were included with this discount link.
          </div>
        )}

        <div className="mt-4">
          <Link href={`${appBase}/billing`} className="text-sm font-semibold text-zinc-700 hover:text-zinc-900">
            Back to Billing
          </Link>
        </div>
      </div>
    </div>
  );
}
