import { notFound, redirect } from "next/navigation";

import { PortalAiChatClient } from "@/app/portal/app/ai-chat/PortalAiChatClient";
import { PortalBillingClient } from "@/app/portal/billing/PortalBillingClient";
import { PortalDashboardClient } from "@/app/portal/PortalDashboardClient";
import { PortalPeopleContactsClient } from "@/app/portal/app/people/contacts/PortalPeopleContactsClient";
import { PortalPeopleContactDuplicatesClient } from "@/app/portal/app/people/contacts/duplicates/PortalPeopleContactDuplicatesClient";
import { PortalPeopleUsersClient } from "@/app/portal/app/people/users/PortalPeopleUsersClient";
import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";
import { SettingsTabsClient } from "@/app/portal/app/settings/SettingsTabsClient";
import { PortalServicePageClient } from "@/app/portal/services/[service]/PortalServicePageClient";
import { PortalServicesClient } from "@/app/portal/app/services/PortalServicesClient";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const dynamic = "force-dynamic";

export default async function CreditAppCatchallPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const session = await requireCreditClientSession();
  if (!session.ok) redirect("/credit/login");

  const slug = (await params).slug || [];

  if (slug.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-600">Your credit services, billing, and workflow stats.</p>
          </div>
        </div>

        <div className="mt-6">
          <PortalDashboardClient />
        </div>
      </div>
    );
  }

  if (slug.length === 1 && slug[0] === "ai-chat") {
    return <PortalAiChatClient />;
  }

  if (slug.length === 1 && slug[0] === "settings") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Settings</h1>
        <SettingsTabsClient generalOnly />
      </div>
    );
  }

  if (slug.length === 1 && slug[0] === "services") {
    return <PortalServicesClient />;
  }

  if (slug.length === 2 && slug[0] === "services") {
    const service = slug[1] || "";
    const serviceRec = PORTAL_SERVICES.find((entry) => entry.slug === service) ?? null;
    if (!serviceRec) notFound();
    if (serviceRec.variants && !serviceRec.variants.includes("credit")) notFound();
    return <PortalServicePageClient slug={service} />;
  }

  if (slug.length === 1 && slug[0] === "billing") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Billing</h1>
        <div className="mt-6">
          <PortalBillingClient embedded hideMonthlyBreakdown />
        </div>
      </div>
    );
  }

  if (slug.length === 1 && slug[0] === "profile") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Profile</h1>
        <p className="mt-2 text-sm text-zinc-600">Account details and security.</p>
        <div className="mt-6">
          <PortalProfileClient embedded mode="profile" />
        </div>
      </div>
    );
  }

  if (slug.length === 1 && slug[0] === "people") {
    redirect("/credit/app/people/contacts");
  }

  if (slug.length === 2 && slug[0] === "people" && slug[1] === "contacts") {
    return <PortalPeopleContactsClient />;
  }

  if (slug.length === 3 && slug[0] === "people" && slug[1] === "contacts" && slug[2] === "duplicates") {
    return <PortalPeopleContactDuplicatesClient />;
  }

  if (slug.length === 2 && slug[0] === "people" && slug[1] === "users") {
    return <PortalPeopleUsersClient />;
  }

  if (slug.length === 1 && slug[0] === "tasks") {
    redirect("/credit/app/services/tasks");
  }

  notFound();
}