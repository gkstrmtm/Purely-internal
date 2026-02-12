import { PORTAL_SERVICES, type PortalService } from "@/app/portal/services/catalog";

export const GET_STARTED_GOALS = [
  { id: "appointments", label: "Book more appointments" },
  { id: "reviews", label: "Get more reviews" },
  { id: "leads", label: "Get more leads" },
  { id: "followup", label: "Spend less time on follow-up" },
  { id: "content", label: "Publish content regularly (SEO)" },
  { id: "inbox", label: "Keep email + SMS in one inbox" },
  { id: "receptionist", label: "Answer common questions 24/7" },
  { id: "outbound", label: "Do more outbound calling" },
  { id: "unsure", label: "Not sure yet" },
] as const;

export type GetStartedGoalId = (typeof GET_STARTED_GOALS)[number]["id"];

function isComingSoon(service: Pick<PortalService, "title" | "description">) {
  const s = `${service.title} ${service.description}`.toLowerCase();
  return s.includes("coming soon");
}

export function getSelectablePortalServices(): PortalService[] {
  return PORTAL_SERVICES.filter((s) => !s.hidden && !isComingSoon(s));
}

export function normalizeGoalIds(goalIds: unknown): GetStartedGoalId[] {
  if (!Array.isArray(goalIds)) return [];
  const allowed = new Set<string>(GET_STARTED_GOALS.map((g) => g.id));
  const out: GetStartedGoalId[] = [];
  for (const raw of goalIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    if (!allowed.has(id)) continue;
    out.push(id as GetStartedGoalId);
  }
  return Array.from(new Set(out)).slice(0, 10);
}

export function goalLabelsFromIds(goalIds: GetStartedGoalId[]): string[] {
  const byId = new Map<GetStartedGoalId, string>(GET_STARTED_GOALS.map((g) => [g.id, g.label]));
  return goalIds.map((id) => byId.get(id)).filter((v): v is string => typeof v === "string");
}

export function normalizeServiceSlugs(serviceSlugs: unknown): string[] {
  if (!Array.isArray(serviceSlugs)) return [];
  const allowed = new Set(getSelectablePortalServices().map((s) => s.slug));
  const out: string[] = [];
  for (const raw of serviceSlugs) {
    const slug = typeof raw === "string" ? raw.trim() : "";
    if (!slug) continue;
    if (!allowed.has(slug)) continue;
    out.push(slug);
  }
  return Array.from(new Set(out)).slice(0, 20);
}

export function recommendPortalServiceSlugs(goalIds: GetStartedGoalId[]): string[] {
  const weights = new Map<string, number>();

  function bump(slug: string, n: number) {
    weights.set(slug, (weights.get(slug) ?? 0) + n);
  }

  for (const g of goalIds) {
    switch (g) {
      case "appointments":
        bump("booking", 10);
        bump("ai-receptionist", 6);
        bump("inbox", 4);
        bump("automations", 3);
        break;
      case "reviews":
        bump("reviews", 10);
        bump("automations", 2);
        break;
      case "leads":
        bump("lead-scraping", 10);
        bump("automations", 2);
        bump("ai-outbound-calls", 1);
        break;
      case "followup":
        bump("automations", 10);
        bump("inbox", 2);
        break;
      case "content":
        bump("blogs", 10);
        bump("media-library", 3);
        break;
      case "inbox":
        bump("inbox", 10);
        bump("media-library", 1);
        break;
      case "receptionist":
        bump("ai-receptionist", 10);
        bump("inbox", 2);
        break;
      case "outbound":
        bump("ai-outbound-calls", 10);
        bump("lead-scraping", 2);
        break;
      case "unsure":
        bump("inbox", 2);
        bump("automations", 2);
        bump("reporting", 1);
        break;
    }
  }

  const allowed = new Set(getSelectablePortalServices().map((s) => s.slug));

  return Array.from(weights.entries())
    .filter(([slug]) => allowed.has(slug))
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug)
    .slice(0, 4);
}
