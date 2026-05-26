require("ts-node/register/transpile-only");

const {
  createFunnelPageDraftUpdate,
  createFunnelPagePublishUpdate,
  getFunnelPageCurrentHtml,
  getFunnelPagePublishedHtml,
  hasFunnelPageDraft,
  isFunnelPageDraftNewerThanLive,
} = require("../src/lib/funnelDraftLiveInvariants.ts");
const {
  inferDistributionProvider,
  normalizeMediaGrowthProfileForSave,
  resolveProviderContinuity,
} = require("../src/lib/mediaGrowthInvariants.ts");
const {
  resolveExternalBookingConfirmationState,
  resolveExternalBookingGuidance,
} = require("../src/lib/externalBookingTruthInvariants.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runFunnelInvariants() {
  const livePage = { customHtml: "<section>live</section>", draftHtml: null };
  const draftedPage = { ...livePage, ...createFunnelPageDraftUpdate("<section>draft</section>") };

  assert(getFunnelPagePublishedHtml(draftedPage) === "<section>live</section>", "Funnel save must not overwrite live HTML.");
  assert(getFunnelPageCurrentHtml(draftedPage) === "<section>draft</section>", "Funnel reopen must prefer draft HTML when present.");
  assert(hasFunnelPageDraft(draftedPage), "Funnel draft presence must be detected after draft save.");
  assert(isFunnelPageDraftNewerThanLive(draftedPage), "Draft newer-than-live should be true when draft differs from live.");

  const publishUpdate = createFunnelPagePublishUpdate(draftedPage);
  assert(Boolean(publishUpdate), "Publish update should exist when a draft is present.");
  const publishedPage = { ...draftedPage, ...publishUpdate };
  assert(publishedPage.customHtml === "<section>draft</section>", "Publish must promote the exact draft HTML to live.");
  assert(!String(publishedPage.draftHtml || "").trim(), "Publish must clear the draft HTML after promotion.");
}

function runMediaInvariants() {
  const plannedProfile = {
    workflowState: "planned",
    targetPlatform: "instagram_post",
    distributionProvider: inferDistributionProvider("instagram_post"),
    providerConnectionState: "connected",
    providerPublishState: null,
    plannedForIso: "2026-05-24T12:00:00.000Z",
    providerQueuedAtIso: null,
    providerPendingAtIso: null,
    providerStatus: null,
    providerPostId: null,
    providerPublishedAtIso: null,
    providerLastError: null,
  };
  const plannedContinuity = resolveProviderContinuity(plannedProfile);
  assert(plannedContinuity.publishState !== "queued" && plannedContinuity.publishState !== "pending", "A planned local time must not count as a queued provider job.");
  assert(plannedContinuity.publishState !== "published", "A planned local time must not count as a provider-published post.");

  const queuedProfile = {
    ...plannedProfile,
    providerPublishState: "queued",
    providerStatus: "queued",
    providerQueuedAtIso: "2026-05-24T12:05:00.000Z",
    queueOrder: 1,
  };
  const queuedContinuity = resolveProviderContinuity(queuedProfile);
  assert(queuedContinuity.publishState === "queued", "Queued must require actual provider queue evidence.");

  const manualProfile = normalizeMediaGrowthProfileForSave(
    {
      ...plannedProfile,
      workflowState: "posted_manually",
      postedAtIso: null,
      providerPublishState: null,
    },
    undefined,
    { nowIso: "2026-05-24T13:00:00.000Z" },
  );
  assert(manualProfile.postedAtIso === "2026-05-24T13:00:00.000Z", "Manual posting must stamp a post time when recorded.");
  assert(manualProfile.providerPublishState === "manual_only", "Manual posting must stay truthful instead of implying provider automation.");

  const blockedProfile = {
    ...plannedProfile,
    providerConnectionState: "not_connected",
    providerPublishState: "blocked",
    providerLastError: "Reconnect Meta before provider publishing can continue.",
  };
  const blockedContinuity = resolveProviderContinuity(blockedProfile);
  assert(blockedContinuity.blocked, "Blocked provider state must stay blocked when connection is not ready.");
  assert(blockedContinuity.detail.includes("Reconnect Meta"), "Blocked provider state must surface the real blocker.");
}

function runBookingInvariants() {
  assert(
    resolveExternalBookingConfirmationState({ confirmedViaRedirect: 1, providerConfirmedBookings: 0 }) === "redirect_confirmed",
    "Redirect returns must stay distinct from provider-confirmed bookings.",
  );
  assert(
    resolveExternalBookingConfirmationState({ confirmedViaRedirect: 1, providerConfirmedBookings: 2 }) === "provider_confirmed",
    "Provider confirmation must outrank redirect-return proof.",
  );

  const redirectGuidance = resolveExternalBookingGuidance({
    enabled: true,
    destinationHost: "book.example.com",
    providerLabel: "booking page",
    providerConfirmationAvailable: false,
    providerConfirmationConnected: false,
    totalHandoffs: 5,
    leadFirstCaptures: 2,
    confirmedViaRedirect: 1,
    providerConfirmedBookings: 0,
  });
  assert(redirectGuidance.state === "redirect_confirmed", "Redirect-return guidance must stay distinct when no provider confirmation exists.");
  assert(redirectGuidance.detail.includes("keep it separate from webhook or API-confirmed booking truth"), "Redirect-return guidance must warn against overstating booking truth.");
}

function main() {
  runFunnelInvariants();
  runMediaInvariants();
  runBookingInvariants();
  console.log("critical-surface-invariants: ok");
}

main();