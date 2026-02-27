import Link from "next/link";

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

export default async function CreditDiscountChooserPage({
  searchParams,
}: {
  searchParams: Promise<{ promoCode?: string; services?: string; campaignId?: string }>;
}) {
  const sp = await searchParams;
  const promoCode = typeof sp?.promoCode === "string" ? sp.promoCode.trim() : "";
  const campaignId = typeof sp?.campaignId === "string" ? sp.campaignId.trim() : "";
  const servicesRaw = typeof sp?.services === "string" ? sp.services : "";
  const serviceSlugs = uniq(servicesRaw.split(",")).slice(0, 20);

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

        <div className="mt-4 grid gap-2">
          {serviceSlugs.map((slug) => {
            const qs = new URLSearchParams();
            if (promoCode) qs.set("promoCode", promoCode);
            if (campaignId) qs.set("campaignId", campaignId);
            const href = `/credit/app/discount/${encodeURIComponent(slug)}?${qs.toString()}`;
            return (
              <Link
                key={slug}
                href={href}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                {slug}
              </Link>
            );
          })}
        </div>

        <div className="mt-4">
          <Link href="/credit/app/billing" className="text-sm font-semibold text-zinc-700 hover:text-zinc-900">
            Back to Billing
          </Link>
        </div>
      </div>
    </div>
  );
}
