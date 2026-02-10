import Link from "next/link";

import { requirePortalUser } from "@/lib/portalAuth";

export default async function PortalServiceNewsletterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requirePortalUser();

  const audienceRaw =
    typeof searchParams?.audience === "string"
      ? searchParams?.audience
      : Array.isArray(searchParams?.audience)
        ? searchParams?.audience[0]
        : "external";
  const audience = String(audienceRaw || "external").toLowerCase() === "internal" ? "internal" : "external";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Newsletter</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Choose an audience: internal newsletters for your team, or external newsletters for leads and customers.
          </p>
        </div>
        <Link
          href="/portal/app/services"
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        >
          All services
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/portal/app/services/newsletter?audience=external"
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition " +
              (audience === "external"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            External (Leads/Customers)
          </Link>
          <Link
            href="/portal/app/services/newsletter?audience=internal"
            className={
              "rounded-2xl border px-4 py-2 text-sm font-semibold transition " +
              (audience === "internal"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            Internal (Users/Employees)
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
        {audience === "external" ? (
          <>
            <div className="text-sm font-semibold text-zinc-900">External newsletter</div>
            <div className="mt-2 text-sm text-zinc-600">
              Send campaigns to leads and customers. Segmentation, deliverability, and engagement tracking are coming soon.
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-zinc-900">Internal newsletter</div>
            <div className="mt-2 text-sm text-zinc-600">
              Send updates to your team (users/employees). This will support internal-only lists and scheduling.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
