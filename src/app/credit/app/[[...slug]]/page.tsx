import { notFound, redirect } from "next/navigation";

import { PortalAiChatClient } from "@/app/portal/app/ai-chat/PortalAiChatClient";
import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalAiOutboundCallsClient } from "@/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient";
import { PortalAiReceptionistClient } from "@/app/portal/app/services/ai-receptionist/PortalAiReceptionistClient";
import { PortalAutomationsClient } from "@/app/portal/app/services/automations/PortalAutomationsClient";
import { PortalBlogsShell } from "@/app/portal/app/services/blogs/(tabs)/PortalBlogsShell";
import { PortalBookingClient } from "@/app/portal/app/services/booking/PortalBookingClient";
import { PortalBookingAvailabilityClient } from "@/app/portal/app/services/booking/availability/PortalBookingAvailabilityClient";
import CreditReportsClient from "@/app/portal/app/services/credit-reports/CreditReportsClient";
import { FunnelBuilderClient } from "@/app/portal/app/services/funnel-builder/FunnelBuilderClient";
import { FormEditorClient } from "@/app/portal/app/services/funnel-builder/forms/[formId]/edit/FormEditorClient";
import { FormResponsesClient } from "@/app/portal/app/services/funnel-builder/forms/[formId]/responses/FormResponsesClient";
import { PortalInboxClient } from "@/app/portal/app/services/inbox/PortalInboxClient";
import { PortalLeadScrapingClient } from "@/app/portal/app/services/lead-scraping/PortalLeadScrapingClient";
import { PortalMediaLibraryClient } from "@/app/portal/app/services/media-library/PortalMediaLibraryClient";
import { PortalMissedCallTextBackClient } from "@/app/portal/app/services/missed-call-textback/PortalMissedCallTextBackClient";
import { PortalNewsletterClient } from "@/app/portal/app/services/newsletter/PortalNewsletterClient";
import { PortalNurtureCampaignsClient } from "@/app/portal/app/services/nurture-campaigns/PortalNurtureCampaignsClient";
import { PortalReportingClient } from "@/app/portal/app/services/reporting/PortalReportingClient";
import { PortalSalesReportingClient } from "@/app/portal/app/services/reporting/sales/PortalSalesReportingClient";
import { PortalStripeSalesClient } from "@/app/portal/app/services/reporting/stripe/PortalStripeSalesClient";
import PortalReviewsClient from "@/app/portal/app/services/reviews/setup/PortalReviewsClient";
import { PortalAppearanceSettingsClient } from "@/app/portal/app/settings/appearance/PortalAppearanceSettingsClient";
import { PortalBillingClient } from "@/app/portal/billing/PortalBillingClient";
import { PortalDashboardClient } from "@/app/portal/PortalDashboardClient";
import { PortalPeopleContactsClient } from "@/app/portal/app/people/contacts/PortalPeopleContactsClient";
import { PortalPeopleContactDuplicatesClient } from "@/app/portal/app/people/contacts/duplicates/PortalPeopleContactDuplicatesClient";
import { PortalPeopleUsersClient } from "@/app/portal/app/people/users/PortalPeopleUsersClient";
import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";
import { SettingsTabsClient } from "@/app/portal/app/settings/SettingsTabsClient";
import { PortalServicePageClient } from "@/app/portal/services/[service]/PortalServicePageClient";
import { PortalServicesClient } from "@/app/portal/app/services/PortalServicesClient";
import { PortalTasksClient } from "@/app/portal/app/tasks/PortalTasksClient";
import DisputeLettersClient from "@/app/credit/app/disputes/DisputeLettersClient";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const dynamic = "force-dynamic";

function renderCreditServiceRoot(service: string) {
  switch (service) {
    case "ai-receptionist":
      return (
        <PortalServiceGate slug="ai-receptionist">
          <PortalAiReceptionistClient />
        </PortalServiceGate>
      );
    case "ai-outbound-calls":
      redirect("/credit/app/services/ai-outbound-calls/calls");
    case "automations":
      return (
        <PortalServiceGate slug="automations">
          <PortalAutomationsClient mode="list" />
        </PortalServiceGate>
      );
    case "blogs":
      return (
        <PortalServiceGate slug="blogs">
          <PortalBlogsShell />
        </PortalServiceGate>
      );
    case "booking":
      return (
        <PortalServiceGate slug="booking">
          <PortalBookingClient />
        </PortalServiceGate>
      );
    case "follow-up":
      redirect("/credit/app/services/booking?tab=follow-up");
    case "funnel-builder":
      return <FunnelBuilderClient />;
    case "inbox":
      redirect("/credit/app/services/inbox/email");
    case "lead-scraping":
      return (
        <PortalServiceGate slug="lead-scraping">
          <PortalLeadScrapingClient />
        </PortalServiceGate>
      );
    case "media-library":
      return (
        <PortalServiceGate slug="media-library">
          <PortalMediaLibraryClient />
        </PortalServiceGate>
      );
    case "missed-call-textback":
      return (
        <PortalServiceGate slug="missed-call-textback">
          <PortalMissedCallTextBackClient />
        </PortalServiceGate>
      );
    case "newsletter":
      redirect("/credit/app/services/newsletter/external");
    case "nurture-campaigns":
      return (
        <PortalServiceGate slug="nurture-campaigns">
          <PortalNurtureCampaignsClient />
        </PortalServiceGate>
      );
    case "reporting":
      return (
        <PortalServiceGate slug="reporting">
          <PortalReportingClient />
        </PortalServiceGate>
      );
    case "reviews":
      return (
        <PortalServiceGate slug="reviews">
          <PortalReviewsClient />
        </PortalServiceGate>
      );
    case "tasks":
      return (
        <PortalServiceGate slug="tasks">
          <PortalTasksClient />
        </PortalServiceGate>
      );
    default:
      return null;
  }
}

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

  if (slug.length === 2 && slug[0] === "settings" && slug[1] === "appearance") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Appearance</h1>
        <div className="mt-6">
          <PortalAppearanceSettingsClient />
        </div>
      </div>
    );
  }

  if (slug.length === 2 && slug[0] === "settings" && slug[1] === "integrations") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Integrations</h1>
        <div className="mt-6">
          <PortalProfileClient embedded mode="integrations" />
        </div>
      </div>
    );
  }

  if (slug.length === 2 && slug[0] === "settings" && slug[1] === "business") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Business</h1>
        <div className="mt-6">
          <PortalProfileClient embedded mode="business" />
        </div>
      </div>
    );
  }

  if (slug.length === 1 && slug[0] === "services") {
    return <PortalServicesClient />;
  }

  if (slug.length === 2 && slug[0] === "services" && slug[1] === "dispute-letters") {
    return <DisputeLettersClient mode="list" />;
  }

  if (slug.length === 3 && slug[0] === "services" && slug[1] === "dispute-letters") {
    return <DisputeLettersClient mode="editor" initialLetterId={slug[2] || ""} />;
  }

  if (slug.length === 2 && slug[0] === "services" && slug[1] === "credit-reports") {
    return <CreditReportsClient mode="list" />;
  }

  if (slug.length === 3 && slug[0] === "services" && slug[1] === "credit-reports") {
    return <CreditReportsClient mode="detail" initialReportId={slug[2] || ""} />;
  }

  if (slug.length === 5 && slug[0] === "services" && slug[1] === "funnel-builder" && slug[2] === "forms" && slug[4] === "edit") {
    return <FormEditorClient basePath="/credit" formId={slug[3] || ""} />;
  }

  if (slug.length === 5 && slug[0] === "services" && slug[1] === "funnel-builder" && slug[2] === "forms" && slug[4] === "responses") {
    return <FormResponsesClient basePath="/credit" formId={slug[3] || ""} />;
  }

  if (slug.length === 2 && slug[0] === "services") {
    const service = slug[1] || "";
    const serviceRec = PORTAL_SERVICES.find((entry) => entry.slug === service) ?? null;
    if (!serviceRec) notFound();
    if (serviceRec.variants && !serviceRec.variants.includes("credit")) notFound();
    const realService = renderCreditServiceRoot(service);
    if (realService) return realService;
    return <PortalServicePageClient slug={service} />;
  }

  if (slug[0] === "services" && slug[1] === "ai-outbound-calls") {
    const tab = String(slug[2] || "calls").toLowerCase();
    if (tab !== "calls" && tab !== "messages" && tab !== "settings") {
      redirect("/credit/app/services/ai-outbound-calls/calls");
    }
    return (
      <PortalServiceGate slug="ai-outbound-calls">
        <PortalAiOutboundCallsClient initialTab={tab as "calls" | "messages" | "settings"} />
      </PortalServiceGate>
    );
  }

  if (slug[0] === "services" && slug[1] === "inbox") {
    const channel = String(slug[2] || "email").toLowerCase();
    if (channel !== "email" && channel !== "sms") {
      redirect("/credit/app/services/inbox/email");
    }
    return (
      <PortalServiceGate slug="inbox">
        <PortalInboxClient initialChannel={channel as "email" | "sms"} />
      </PortalServiceGate>
    );
  }

  if (slug[0] === "services" && slug[1] === "newsletter") {
    const audience = String(slug[2] || "external").toLowerCase();
    if (audience !== "external" && audience !== "internal") {
      redirect("/credit/app/services/newsletter/external");
    }
    return (
      <PortalServiceGate slug="newsletter">
        <PortalNewsletterClient initialAudience={audience as "external" | "internal"} />
      </PortalServiceGate>
    );
  }

  if (slug[0] === "services" && slug[1] === "booking" && slug.length >= 3) {
    const leaf = String(slug[2] || "").toLowerCase();
    if (leaf === "availability") {
      return (
        <PortalServiceGate slug="booking">
          <PortalBookingAvailabilityClient />
        </PortalServiceGate>
      );
    }
    if (leaf === "appointments") redirect("/credit/app/services/booking?tab=appointments");
    if (leaf === "settings") redirect("/credit/app/services/booking?tab=settings");
    if (leaf === "reminders") redirect("/credit/app/services/booking?tab=reminders");
    if (leaf === "follow-up") redirect("/credit/app/services/booking?tab=follow-up");
  }

  if (slug[0] === "services" && slug[1] === "reporting" && slug.length >= 3) {
    const leaf = String(slug[2] || "").toLowerCase();
    if (leaf === "sales") {
      return (
        <PortalServiceGate slug="reporting">
          <PortalSalesReportingClient />
        </PortalServiceGate>
      );
    }
    if (leaf === "stripe") {
      return (
        <PortalServiceGate slug="reporting">
          <PortalStripeSalesClient />
        </PortalServiceGate>
      );
    }
  }

  if (slug[0] === "services" && slug[1] === "automations" && slug[2] === "editor") {
    return (
      <PortalServiceGate slug="automations">
        <PortalAutomationsClient mode="editor" />
      </PortalServiceGate>
    );
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