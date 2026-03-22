import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

import type { DashboardWidgetId } from "@/lib/portalDashboard";

export function proposeDashboardAddWidgets(opts: {
  businessName: string;
  existingWidgetIds: DashboardWidgetId[];
  recommendedWidgetIds: DashboardWidgetId[];
}): SuggestedSetupAction | null {
  const existing = new Set(opts.existingWidgetIds);
  const toAdd = opts.recommendedWidgetIds.filter((id) => !existing.has(id));
  if (!toAdd.length) return null;

  const payload = { widgetIds: toAdd };

  const businessName = String(opts.businessName || "").trim();

  return {
    id: actionIdFromParts({ kind: "dashboard.addWidgets", serviceSlug: "dashboard", signature: payload }),
    serviceSlug: "dashboard",
    kind: "dashboard.addWidgets",
    title: "Personalize your dashboard",
    description: businessName
      ? `Adds a few helpful widgets so ${businessName} can track activity at a glance.`
      : "Adds a few helpful widgets so you can track activity at a glance.",
    payload,
  };
}
