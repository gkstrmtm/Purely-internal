export type PortalWidgetTone = "blue" | "pink" | "ink" | "emerald" | "slate" | "violet" | "amber";

export function toneForPortalWidget(widgetId: string): PortalWidgetTone {
  switch (widgetId) {
    case "stripeSales":
    case "bookingsCreated":
    case "nurtureEnrollments":
    case "reliabilitySummary":
    case "perfLeadScraping":
      return "emerald";
    case "creditsRemaining":
    case "aiCalls":
    case "perfAiReceptionist":
      return "blue";
    case "blogGenerations":
    case "successRate":
    case "aiOutboundCalls":
    case "perfReviews":
      return "violet";
    case "blogCreditsUsed":
    case "creditsRunway":
    case "newsletterSends":
      return "amber";
    case "creditsUsed":
    case "missedCalls":
    case "perfMissedCallTextBack":
      return "pink";
    case "tasks":
      return "slate";
    default:
      return "ink";
  }
}

export function portalWidgetUsesFilledSurface(tone: PortalWidgetTone) {
  return tone === "blue" || tone === "emerald" || tone === "violet" || tone === "amber";
}
