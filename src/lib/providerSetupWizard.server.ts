import { prisma } from "@/lib/db";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getBookingMeetingIntegrationStatus } from "@/lib/bookingMeetingIntegrations.server";
import { getOutboundEmailProvider, getOutboundEmailFrom, isOutboundEmailConfigured, missingOutboundEmailConfigReason } from "@/lib/emailSender";
import { getExternalBookingLinkConfig } from "@/lib/externalBookingLink";
import { getMissedCallTextBackServiceData } from "@/lib/missedCallTextBack";
import { getOwnerMailboxAddressForUi } from "@/lib/portalMailbox";
import { getPortalMetaProviderReadiness } from "@/lib/portalMetaIntegration.server";
import { getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";
import { getSalesReportingStatus } from "@/lib/salesReportingIntegration.server";
import {
  buildProviderSetupWizardHref,
  portalBaseFromWorkspaceVariant,
  type ProviderSetupItem,
  type ProviderSetupKey,
  type ProviderSetupWizardPayload,
} from "@/lib/providerSetupWizard";

function envFirst(keys: string[]) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function exactIntegrationHref(portalBase: "/portal" | "/credit", anchor: "twilio" | "sales-reporting" | "business-email") {
  const hash = anchor === "twilio"
    ? "#twilio-controls"
    : anchor === "sales-reporting"
      ? "#sales-reporting-controls"
      : "#business-email-controls";
  return `${portalBase}/app/settings/integrations${hash}`;
}

function bookingSettingsHref(portalBase: "/portal" | "/credit") {
  return `${portalBase}/app/services/booking?tab=settings`;
}

function aiReceptionistHref(portalBase: "/portal" | "/credit") {
  return `${portalBase}/app/services/ai-receptionist`;
}

function reportingSalesHref(portalBase: "/portal" | "/credit") {
  return `${portalBase}/app/services/reporting/sales`;
}

function mediaLibraryHref(portalBase: "/portal" | "/credit") {
  return `${portalBase}/app/services/media-library`;
}

function hasVoiceAgentKey(profileData: unknown) {
  const record = profileData && typeof profileData === "object" && !Array.isArray(profileData)
    ? (profileData as Record<string, unknown>)
    : null;
  const stored = typeof record?.voiceAgentApiKey === "string" ? record.voiceAgentApiKey.trim() : "";
  return Boolean(stored || envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]));
}

function hasVoiceAgentId(profileData: unknown, receptionistSettings: unknown) {
  const profileRecord = profileData && typeof profileData === "object" && !Array.isArray(profileData)
    ? (profileData as Record<string, unknown>)
    : null;
  const receptionistRecord = receptionistSettings && typeof receptionistSettings === "object" && !Array.isArray(receptionistSettings)
    ? (receptionistSettings as Record<string, unknown>)
    : null;
  const storedProfile = typeof profileRecord?.voiceAgentId === "string" ? profileRecord.voiceAgentId.trim() : "";
  const storedReceptionist = typeof receptionistRecord?.voiceAgentId === "string" ? receptionistRecord.voiceAgentId.trim() : "";
  return Boolean(storedReceptionist || storedProfile || envFirst(["VOICE_AGENT_ID", "ELEVENLABS_AGENT_ID", "ELEVEN_LABS_AGENT_ID"]));
}

function receptionistEnabled(settings: unknown) {
  const record = settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : null;
  return Boolean(record?.enabled);
}

function textbackEnabled(settings: unknown) {
  const record = settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : null;
  return Boolean(record?.enabled);
}

function configuredCount(items: ProviderSetupItem[]) {
  return items.filter((item) => item.status === "connected" || item.status === "test_ready" || item.status === "live_ready").length;
}

export async function getProviderSetupWizardPayload(input: {
  ownerId: string;
  workspaceVariant?: string | null;
  isOwnerSession?: boolean;
}): Promise<ProviderSetupWizardPayload> {
  const portalBase = portalBaseFromWorkspaceVariant(input.workspaceVariant);
  const workspaceVariant = portalBase === "/credit" ? "credit" : "portal";
  const [mailbox, twilio, receptionistData, missedCallData, bookingSite, bookingIntegrations, externalBooking, sales, meta, profileSetup] = await Promise.all([
    getOwnerMailboxAddressForUi(input.ownerId).catch(() => null),
    getOwnerTwilioSmsConfigMasked(input.ownerId).catch(() => null),
    getAiReceptionistServiceData(input.ownerId).catch(() => null),
    getMissedCallTextBackServiceData(input.ownerId).catch(() => null),
    prisma.portalBookingSite.findUnique({ where: { ownerId: input.ownerId }, select: { enabled: true, slug: true } }).catch(() => null),
    getBookingMeetingIntegrationStatus(input.ownerId).catch(() => null),
    getExternalBookingLinkConfig(input.ownerId).catch(() => null),
    getSalesReportingStatus(input.ownerId).catch(() => null),
    getPortalMetaProviderReadiness(input.ownerId, { portalVariant: workspaceVariant, isOwnerSession: input.isOwnerSession }).catch(() => null),
    prisma.portalServiceSetup.findUnique({ where: { ownerId_serviceSlug: { ownerId: input.ownerId, serviceSlug: "profile" } }, select: { dataJson: true } }).catch(() => null),
  ]);

  const emailWizardHref = buildProviderSetupWizardHref(portalBase, "email");
  const twilioSmsWizardHref = buildProviderSetupWizardHref(portalBase, "twilio_sms");
  const twilioVoiceWizardHref = buildProviderSetupWizardHref(portalBase, "twilio_voice");
  const bookingWizardHref = buildProviderSetupWizardHref(portalBase, "booking");
  const paymentWizardHref = buildProviderSetupWizardHref(portalBase, "payment");
  const metaWizardHref = buildProviderSetupWizardHref(portalBase, "meta");

  const mailboxEmail = mailbox?.emailAddress || null;
  const outboundConfigured = isOutboundEmailConfigured();
  const outboundProvider = getOutboundEmailProvider();
  const { fromEmail } = getOutboundEmailFrom();

  const emailItem: ProviderSetupItem = !outboundConfigured
    ? {
        key: "email",
        displayName: "Email sending",
        category: "communication",
        status: "blocked",
        reason: `Purely cannot send emails from this deployment yet. ${missingOutboundEmailConfigReason()}.`,
        businessOutcome: workspaceVariant === "credit"
          ? "Needed to send client follow-up emails and document reminders from Purely."
          : "Needed to send emails from Purely.",
        setupHref: exactIntegrationHref(portalBase, "business-email"),
        wizardHref: emailWizardHref,
        testActionHref: exactIntegrationHref(portalBase, "business-email"),
        testActionLabel: "Review mailbox identity",
        liveActionWarning: "This wizard does not send a live test email.",
        connectedLabel: null,
      }
    : mailboxEmail
      ? {
          key: "email",
          displayName: "Email sending",
          category: "communication",
          status: "live_ready",
          reason: `${outboundProvider || "Email"} delivery is configured and this workspace has a mailbox identity at ${mailboxEmail}.`,
          businessOutcome: workspaceVariant === "credit"
            ? "Needed to send client follow-up emails and document reminders from Purely."
            : "Needed to send emails from Purely.",
          setupHref: exactIntegrationHref(portalBase, "business-email"),
          wizardHref: emailWizardHref,
          testActionHref: exactIntegrationHref(portalBase, "business-email"),
          testActionLabel: "Review mailbox identity",
          liveActionWarning: "This wizard does not send a live test email.",
          connectedLabel: mailboxEmail,
        }
      : {
          key: "email",
          displayName: "Email sending",
          category: "communication",
          status: "needs_setup",
          reason: `Email delivery is configured${fromEmail ? ` from ${fromEmail}` : ""}, but this workspace still needs a business mailbox identity.`,
          businessOutcome: workspaceVariant === "credit"
            ? "Needed to send client follow-up emails and document reminders from Purely."
            : "Needed to send emails from Purely.",
          setupHref: exactIntegrationHref(portalBase, "business-email"),
          wizardHref: emailWizardHref,
          testActionHref: exactIntegrationHref(portalBase, "business-email"),
          testActionLabel: "Set mailbox identity",
          liveActionWarning: "This wizard does not send a live test email.",
          connectedLabel: null,
        };

  const twilioConfigured = Boolean(twilio?.configured);
  const twilioFromNumber = twilio?.fromNumberE164 || null;
  const twilioSmsItem: ProviderSetupItem = twilioConfigured
    ? {
        key: "twilio_sms",
        displayName: "Twilio SMS",
        category: "communication",
        status: "live_ready",
        reason: twilioFromNumber
          ? `Twilio is connected on ${twilioFromNumber}, so Purely can send and receive texts when the workflow calls for it.`
          : "Twilio is connected, so Purely can send and receive texts when the workflow calls for it.",
        businessOutcome: workspaceVariant === "credit"
          ? "Needed to send and receive client follow-up texts."
          : "Needed to send and receive texts.",
        setupHref: exactIntegrationHref(portalBase, "twilio"),
        wizardHref: twilioSmsWizardHref,
        testActionHref: exactIntegrationHref(portalBase, "twilio"),
        testActionLabel: "Review Twilio setup",
        liveActionWarning: "This wizard does not send a live SMS.",
        connectedLabel: twilioFromNumber,
      }
    : {
        key: "twilio_sms",
        displayName: "Twilio SMS",
        category: "communication",
        status: "needs_setup",
        reason: "Twilio credentials and a sending number are still missing for this workspace.",
        businessOutcome: workspaceVariant === "credit"
          ? "Needed to send and receive client follow-up texts."
          : "Needed to send and receive texts.",
        setupHref: exactIntegrationHref(portalBase, "twilio"),
        wizardHref: twilioSmsWizardHref,
        testActionHref: exactIntegrationHref(portalBase, "twilio"),
        testActionLabel: "Open Twilio controls",
        liveActionWarning: "This wizard does not send a live SMS.",
        connectedLabel: null,
      };

  const receptionistSettings = receptionistData?.settings ?? null;
  const missedCallSettings = missedCallData?.settings ?? null;
  const voiceApiKeyConfigured = hasVoiceAgentKey(profileSetup?.dataJson);
  const voiceAgentIdConfigured = hasVoiceAgentId(profileSetup?.dataJson, receptionistSettings);
  const voiceReady = voiceApiKeyConfigured && voiceAgentIdConfigured;
  const receptionistLive = receptionistEnabled(receptionistSettings);
  const textbackLive = textbackEnabled(missedCallSettings);
  const voiceConnectedLabel = receptionistLive
    ? "AI receptionist enabled"
    : textbackLive
      ? "Missed-call text back enabled"
      : voiceReady
        ? "Voice agent ready"
        : null;
  const twilioVoiceItem: ProviderSetupItem = !twilioConfigured
    ? {
        key: "twilio_voice",
        displayName: "Twilio voice / AI receptionist",
        category: "communication",
        status: "blocked",
        reason: "Voice handling stays blocked until Twilio is connected first.",
        businessOutcome: workspaceVariant === "credit"
          ? "Needed for consultation calls, AI receptionist calls, and missed-call handling."
          : "Needed for AI receptionist calls and call handling.",
        setupHref: aiReceptionistHref(portalBase),
        wizardHref: twilioVoiceWizardHref,
        testActionHref: exactIntegrationHref(portalBase, "twilio"),
        testActionLabel: "Connect Twilio first",
        liveActionWarning: "This wizard does not place a live call.",
        connectedLabel: null,
      }
    : receptionistLive
      ? {
          key: "twilio_voice",
          displayName: "Twilio voice / AI receptionist",
          category: "communication",
          status: "live_ready",
          reason: textbackLive
            ? "AI receptionist and missed-call text back are both enabled on top of the Twilio connection."
            : "AI receptionist is enabled on top of the Twilio connection.",
          businessOutcome: workspaceVariant === "credit"
            ? "Needed for consultation calls, AI receptionist calls, and missed-call handling."
            : "Needed for AI receptionist calls and call handling.",
          setupHref: aiReceptionistHref(portalBase),
          wizardHref: twilioVoiceWizardHref,
          testActionHref: aiReceptionistHref(portalBase),
          testActionLabel: "Review receptionist setup",
          liveActionWarning: "This wizard does not place a live call.",
          connectedLabel: voiceConnectedLabel,
        }
      : voiceReady || textbackLive
        ? {
            key: "twilio_voice",
            displayName: "Twilio voice / AI receptionist",
            category: "communication",
            status: "test_ready",
            reason: textbackLive
              ? "Twilio and missed-call text back are ready, but AI receptionist is not fully enabled yet."
              : "Twilio and the voice-agent credentials are in place, but the receptionist workflow is not fully enabled yet.",
            businessOutcome: workspaceVariant === "credit"
              ? "Needed for consultation calls, AI receptionist calls, and missed-call handling."
              : "Needed for AI receptionist calls and call handling.",
            setupHref: aiReceptionistHref(portalBase),
            wizardHref: twilioVoiceWizardHref,
            testActionHref: aiReceptionistHref(portalBase),
            testActionLabel: "Open AI receptionist",
            liveActionWarning: "This wizard does not place a live call.",
            connectedLabel: voiceConnectedLabel,
          }
        : {
            key: "twilio_voice",
            displayName: "Twilio voice / AI receptionist",
            category: "communication",
            status: "needs_setup",
            reason: "Twilio is connected, but the voice-agent credentials and receptionist setup are still incomplete.",
            businessOutcome: workspaceVariant === "credit"
              ? "Needed for consultation calls, AI receptionist calls, and missed-call handling."
              : "Needed for AI receptionist calls and call handling.",
            setupHref: aiReceptionistHref(portalBase),
            wizardHref: twilioVoiceWizardHref,
            testActionHref: aiReceptionistHref(portalBase),
            testActionLabel: "Open AI receptionist",
            liveActionWarning: "This wizard does not place a live call.",
            connectedLabel: null,
          };

  const bookingEnabled = Boolean(bookingSite?.enabled);
  const bookingPreviewHref = bookingSite?.slug ? `/book/${encodeURIComponent(bookingSite.slug)}` : null;
  const externalBookingEnabled = Boolean(externalBooking?.enabled && externalBooking.normalizedUrl);
  const connectedMeetingProviders = bookingIntegrations
    ? Object.values(bookingIntegrations.providers).filter((provider) => provider.connected).length
    : 0;
  const bookingItem: ProviderSetupItem = bookingEnabled
    ? {
        key: "booking",
        displayName: workspaceVariant === "credit" ? "Consultation booking" : "Booking",
        category: workspaceVariant === "credit" ? "credit" : "booking",
        status: "live_ready",
        reason: "Purely's booking page is enabled for this workspace.",
        businessOutcome: workspaceVariant === "credit"
          ? "Needed so people can book credit consultations or be routed to your existing consultation page."
          : "Needed so people can book or be routed to your existing booking page.",
        setupHref: bookingSettingsHref(portalBase),
        wizardHref: bookingWizardHref,
        testActionHref: bookingPreviewHref,
        testActionLabel: bookingPreviewHref ? "Preview booking page" : "Open booking settings",
        liveActionWarning: null,
        connectedLabel: bookingSite?.slug || null,
      }
    : externalBookingEnabled
      ? {
          key: "booking",
          displayName: workspaceVariant === "credit" ? "Consultation booking" : "Booking",
          category: workspaceVariant === "credit" ? "credit" : "booking",
          status: "live_ready",
          reason: `Purely is routing people to ${externalBooking?.providerLabel || "your external booking page"}. Provider-confirmed booking proof still depends on the downstream booking connection.`,
          businessOutcome: workspaceVariant === "credit"
            ? "Needed so people can book credit consultations or be routed to your existing consultation page."
            : "Needed so people can book or be routed to your existing booking page.",
          setupHref: bookingSettingsHref(portalBase),
          wizardHref: bookingWizardHref,
          testActionHref: externalBooking?.normalizedUrl || null,
          testActionLabel: externalBooking?.normalizedUrl ? "Review booking link" : "Open booking settings",
          liveActionWarning: null,
          connectedLabel: externalBooking?.providerLabel || null,
        }
      : connectedMeetingProviders > 0
        ? {
            key: "booking",
            displayName: workspaceVariant === "credit" ? "Consultation booking" : "Booking",
            category: workspaceVariant === "credit" ? "credit" : "booking",
            status: "connected",
            reason: connectedMeetingProviders === 1
              ? "A meeting provider is connected, but the booking route itself is not live yet."
              : "Meeting providers are connected, but the booking route itself is not live yet.",
            businessOutcome: workspaceVariant === "credit"
              ? "Needed so people can book credit consultations or be routed to your existing consultation page."
              : "Needed so people can book or be routed to your existing booking page.",
            setupHref: bookingSettingsHref(portalBase),
            wizardHref: bookingWizardHref,
            testActionHref: bookingSettingsHref(portalBase),
            testActionLabel: "Finish booking setup",
            liveActionWarning: null,
            connectedLabel: connectedMeetingProviders === 1 ? "1 meeting provider connected" : `${connectedMeetingProviders} meeting providers connected`,
          }
        : {
            key: "booking",
            displayName: workspaceVariant === "credit" ? "Consultation booking" : "Booking",
            category: workspaceVariant === "credit" ? "credit" : "booking",
            status: "needs_setup",
            reason: workspaceVariant === "credit"
              ? "No live consultation booking path is configured yet."
              : "No live booking path is configured yet.",
            businessOutcome: workspaceVariant === "credit"
              ? "Needed so people can book credit consultations or be routed to your existing consultation page."
              : "Needed so people can book or be routed to your existing booking page.",
            setupHref: bookingSettingsHref(portalBase),
            wizardHref: bookingWizardHref,
            testActionHref: bookingSettingsHref(portalBase),
            testActionLabel: "Open booking settings",
            liveActionWarning: null,
            connectedLabel: null,
          };

  const anyPaymentProviderConfigured = Boolean(sales && Object.values(sales.providers).some((provider) => provider.configured));
  const activePaymentProvider = sales?.activeProvider || null;
  const paymentConnectedLabel = activePaymentProvider || (anyPaymentProviderConfigured ? "Provider saved" : null);
  const paymentItem: ProviderSetupItem = !sales?.encryptionConfigured
    ? {
        key: "payment",
        displayName: workspaceVariant === "credit" ? "Payment / sales totals" : "Payment / sales reporting",
        category: workspaceVariant === "credit" ? "credit" : "payment",
        status: "blocked",
        reason: "Secure integration storage is not configured on this deployment, so provider credentials cannot be saved yet.",
        businessOutcome: workspaceVariant === "credit"
          ? "Needed for sales totals and revenue visibility across the credit workspace."
          : "Needed for sales reporting and payment totals.",
        setupHref: reportingSalesHref(portalBase),
        wizardHref: paymentWizardHref,
        testActionHref: reportingSalesHref(portalBase),
        testActionLabel: "Open sales reporting",
        liveActionWarning: "Connecting a payment provider here does not trigger a charge.",
        connectedLabel: null,
      }
    : activePaymentProvider
      ? {
          key: "payment",
          displayName: workspaceVariant === "credit" ? "Payment / sales totals" : "Payment / sales reporting",
          category: workspaceVariant === "credit" ? "credit" : "payment",
          status: "live_ready",
          reason: `${activePaymentProvider} is connected as the active payment reporting provider.`,
          businessOutcome: workspaceVariant === "credit"
            ? "Needed for sales totals and revenue visibility across the credit workspace."
            : "Needed for sales reporting and payment totals.",
          setupHref: reportingSalesHref(portalBase),
          wizardHref: paymentWizardHref,
          testActionHref: reportingSalesHref(portalBase),
          testActionLabel: "Review sales reporting",
          liveActionWarning: "Connecting a payment provider here does not trigger a charge.",
          connectedLabel: paymentConnectedLabel,
        }
      : anyPaymentProviderConfigured
        ? {
            key: "payment",
            displayName: workspaceVariant === "credit" ? "Payment / sales totals" : "Payment / sales reporting",
            category: workspaceVariant === "credit" ? "credit" : "payment",
            status: "connected",
            reason: "A payment provider is saved, but no active provider is selected for reporting yet.",
            businessOutcome: workspaceVariant === "credit"
              ? "Needed for sales totals and revenue visibility across the credit workspace."
              : "Needed for sales reporting and payment totals.",
            setupHref: reportingSalesHref(portalBase),
            wizardHref: paymentWizardHref,
            testActionHref: reportingSalesHref(portalBase),
            testActionLabel: "Choose active provider",
            liveActionWarning: "Connecting a payment provider here does not trigger a charge.",
            connectedLabel: paymentConnectedLabel,
          }
        : {
            key: "payment",
            displayName: workspaceVariant === "credit" ? "Payment / sales totals" : "Payment / sales reporting",
            category: workspaceVariant === "credit" ? "credit" : "payment",
            status: "needs_setup",
            reason: "No supported payment reporting provider is connected yet.",
            businessOutcome: workspaceVariant === "credit"
              ? "Needed for sales totals and revenue visibility across the credit workspace."
              : "Needed for sales reporting and payment totals.",
            setupHref: reportingSalesHref(portalBase),
            wizardHref: paymentWizardHref,
            testActionHref: reportingSalesHref(portalBase),
            testActionLabel: "Open sales reporting",
            liveActionWarning: "Connecting a payment provider here does not trigger a charge.",
            connectedLabel: null,
          };

  const metaItem: ProviderSetupItem = meta
    ? {
        key: "meta",
        displayName: workspaceVariant === "credit" ? "Social publishing" : "Social publishing",
        category: workspaceVariant === "credit" ? "credit" : "social",
        status: meta.status === "connected"
          ? "connected"
          : meta.status === "not_connected"
            ? "needs_setup"
            : meta.status === "needs_permissions" || meta.status === "reconnect_required" || meta.status === "disabled"
              ? "blocked"
              : "coming_soon",
        reason: meta.status === "connected"
          ? `${meta.connectedAccountLabel || "Meta account"} is connected. Choose destination assets in Media Library after setup review.`
          : meta.setupMessage,
        businessOutcome: workspaceVariant === "credit"
          ? "Manual posting is available now. Meta connection setup prepares Facebook and Instagram for a future approved provider lane."
          : "Manual posting is available now. Meta connection setup prepares Facebook and Instagram for a future approved provider lane.",
        setupHref: metaWizardHref,
        wizardHref: metaWizardHref,
        testActionHref: mediaLibraryHref(portalBase),
        testActionLabel: "Open media library",
        liveActionWarning: "This setup flow does not publish to Meta.",
        connectedLabel: meta.connectedAccountLabel || null,
      }
    : {
        key: "meta",
        displayName: workspaceVariant === "credit" ? "Social publishing" : "Social publishing",
        category: workspaceVariant === "credit" ? "credit" : "social",
        status: "coming_soon",
        reason: "Manual posting is available now. Meta connection and direct publishing posture are not available from this deployment yet.",
        businessOutcome: workspaceVariant === "credit"
          ? "Manual posting is available now. Social setup will appear here when Meta connection posture is available."
          : "Manual posting is available now. Social setup will appear here when Meta connection posture is available.",
        setupHref: metaWizardHref,
        wizardHref: metaWizardHref,
        testActionHref: mediaLibraryHref(portalBase),
        testActionLabel: "Open media library",
        liveActionWarning: "This setup flow does not publish to Meta.",
        connectedLabel: null,
      };

  const items = [emailItem, twilioSmsItem, twilioVoiceItem, bookingItem, paymentItem, metaItem];
  const actionableItems = items.filter((item) => item.status !== "coming_soon");

  return {
    workspaceVariant,
    portalBase,
    checkedAtIso: new Date().toISOString(),
    summary: {
      configuredCount: configuredCount(items),
      actionableCount: actionableItems.length,
      totalCount: items.length,
      liveReadyCount: items.filter((item) => item.status === "live_ready").length,
      testReadyCount: items.filter((item) => item.status === "test_ready").length,
      blockedCount: items.filter((item) => item.status === "blocked").length,
    },
    items,
  };
}