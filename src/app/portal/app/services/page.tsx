import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { IconServiceGlyph } from "@/app/portal/PortalIcons";

export default async function PortalAppServicesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Services</h1>
          <p className="mt-1 text-sm text-zinc-600">Everything available in your portal.</p>
        </div>
        <Link
          href="/portal/app/billing"
          className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Billing
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => (
          <Link
            key={s.slug}
            href={`/portal/app/services/${s.slug}`}
            className="group rounded-3xl border border-zinc-200 bg-white p-6 hover:bg-zinc-50"
          >
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white">
              <span
                className={
                  s.accent === "blue"
                    ? "text-[color:var(--color-brand-blue)]"
                    : s.accent === "coral"
                      ? "text-[color:var(--color-brand-pink)]"
                      : "text-zinc-700"
                }
              >
                <IconServiceGlyph slug={s.slug} />
              </span>
            </div>
            <div className="text-base font-semibold text-brand-ink group-hover:text-zinc-900">
              {s.title}
            </div>
            <div className="mt-2 text-sm text-zinc-600">{s.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
