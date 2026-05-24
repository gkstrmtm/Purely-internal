import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { IconBillingGlyph, IconProfileGlyph, IconSettingsGlyph } from "@/app/portal/PortalIcons";
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
import { FunnelEditorClient } from "@/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient";
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
import { ProviderSetupWizardPanel } from "@/app/portal/app/settings/integrations/ProviderSetupWizardPanel";
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
      return (
        <PortalServiceGate slug="ai-outbound-calls">
          <PortalAiOutboundCallsClient initialTab="calls" />
        </PortalServiceGate>
      );
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
      return (
        <PortalServiceGate slug="booking">
          <PortalBookingClient initialTopTab="follow-up" />
        </PortalServiceGate>
      );
    case "funnel-builder":
      return <FunnelBuilderClient />;
    case "inbox":
      return (
        <PortalServiceGate slug="inbox">
          <PortalInboxClient initialChannel="email" />
        </PortalServiceGate>
      );
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
      return (
        <PortalServiceGate slug="newsletter">
          <PortalNewsletterClient initialAudience="external" />
        </PortalServiceGate>
      );
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

function CreditSettingsLanding() {
  const cards = [
    {
      title: "General settings",
      description: "Brand basics, account defaults, and service usage from one place.",
      href: "/credit/app/settings",
      icon: <IconSettingsGlyph size={18} />,
    },
    {
      title: "Appearance",
      description: "Update the portal look and customer-facing visual defaults.",
      href: "/credit/app/settings/appearance",
      icon: <IconSettingsGlyph size={18} />,
    },
    {
      title: "Business",
      description: "Manage business information used across credit flows and pages.",
      href: "/credit/app/settings/business",
      icon: <IconSettingsGlyph size={18} />,
    },
    {
      title: "Integrations",
      description: "Connect outside tools without hunting through separate pages.",
      href: "/credit/app/settings/integrations",
      icon: <IconSettingsGlyph size={18} />,
    },
    {
      title: "Profile",
      description: "Update personal account details and security-related info.",
      href: "/credit/app/profile",
      icon: <IconProfileGlyph size={18} />,
    },
    {
      title: "Billing",
      description: "See plan details, credits, and subscription controls.",
      href: "/credit/app/billing",
      icon: <IconBillingGlyph size={18} />,
    },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Settings</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600">Account setup, billing, profile updates, and credit workspace defaults should all be easy to reach from here.</p>

      <SettingsTabsClient generalOnly />

      <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-zinc-900">Quick destinations</h2>
          <p className="text-sm text-zinc-600">Use the direct route that matches what you are actually trying to change.</p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-3xl border border-zinc-200 bg-zinc-50 p-4 transition-colors duration-150 hover:border-zinc-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700">
                  {card.icon}
                </div>
                <span className="text-sm font-semibold text-zinc-400 transition-colors duration-150 group-hover:text-zinc-700">→</span>
              </div>
              <div className="mt-4 text-sm font-semibold text-zinc-900">{card.title}</div>
              <div className="mt-1 text-sm leading-6 text-zinc-600">{card.description}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
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
    return <PortalAiChatClient basePath="/credit" />;
  }

  if (slug.length === 2 && slug[0] === "ai-chat") {
    return <PortalAiChatClient basePath="/credit" initialThreadRef={slug[1] || null} />;
  }

  if (slug.length === 1 && slug[0] === "settings") {
    return <CreditSettingsLanding />;
  }

  if (slug.length === 2 && slug[0] === "settings" && slug[1] === "general") {
    redirect("/credit/app/settings");
  }

  if (slug.length === 2 && slug[0] === "settings" && slug[1] === "profile") {
    redirect("/credit/app/profile");
  }

  if (slug.length === 2 && slug[0] === "settings" && slug[1] === "billing") {
    redirect("/credit/app/billing");
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
          <ProviderSetupWizardPanel />
        </div>
        <div id="provider-setup-controls" className="mt-6">
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

  if (slug.length === 5 && slug[0] === "services" && slug[1] === "funnel-builder" && slug[2] === "funnels" && slug[4] === "edit") {
    return <FunnelEditorClient basePath="/credit" funnelId={slug[3] || ""} />;
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
    if (leaf === "appointments") {
      return (
        <PortalServiceGate slug="booking">
          <PortalBookingClient initialTopTab="appointments" />
        </PortalServiceGate>
      );
    }
    if (leaf === "settings") {
      return (
        <PortalServiceGate slug="booking">
          <PortalBookingClient initialTopTab="settings" />
        </PortalServiceGate>
      );
    }
    if (leaf === "reminders") {
      return (
        <PortalServiceGate slug="booking">
          <PortalBookingClient initialTopTab="reminders" />
        </PortalServiceGate>
      );
    }
    if (leaf === "follow-up") {
      return (
        <PortalServiceGate slug="booking">
          <PortalBookingClient initialTopTab="follow-up" />
        </PortalServiceGate>
      );
    }
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