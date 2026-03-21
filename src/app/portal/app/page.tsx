import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PortalDashboardClient } from "@/app/portal/PortalDashboardClient";
import { requirePortalUser } from "@/lib/portalAuth";

function isMobileUserAgent(ua: string) {
  const s = String(ua || "");
  if (!s) return false;
  if (/iPad/i.test(s)) return false;
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(s);
}

function toFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function PortalAppHomePage({
  searchParams,
}: {
  // Next's generated PageProps uses `searchParams?: Promise<any>`.
  // Using `any` here avoids brittle mismatches across Next versions,
  // while we still safely normalize into a Record via `await` + fallback.
  searchParams?: any;
}) {
  const h = await headers();
  const host = String(h.get("host") || "").toLowerCase();
  const ua = String(h.get("user-agent") || "");

  const resolvedSearchParams = ((await searchParams) ?? {}) as Record<string, string | string[] | undefined>;

  const platformHost = host.includes("purelyautomation.com") || host.includes("localhost") || host.includes("127.0.0.1") || host.includes("vercel.app");
  const paMobileApp = (toFirstParam(resolvedSearchParams?.pa_mobileapp) || "").trim();

  if (platformHost && paMobileApp !== "1" && isMobileUserAgent(ua)) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(resolvedSearchParams || {})) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) sp.append(k, String(item));
      } else {
        sp.set(k, String(v));
      }
    }
    sp.set("pa_mobileapp", "1");
    redirect(`/portal/app?${sp.toString()}`);
  }

  await requirePortalUser();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600">Your services, billing, and automation stats.</p>
        </div>
      </div>

      <div className="mt-6">
        <PortalDashboardClient />
      </div>
    </div>
  );
}
