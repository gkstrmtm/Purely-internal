import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { hasPlacesKey, placesTextSearch } from "@/lib/googlePlaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

const STATE_CAPITALS = [
  { name: "Alabama", abbr: "AL", city: "Montgomery" },
  { name: "Alaska", abbr: "AK", city: "Juneau" },
  { name: "Arizona", abbr: "AZ", city: "Phoenix" },
  { name: "Arkansas", abbr: "AR", city: "Little Rock" },
  { name: "California", abbr: "CA", city: "Sacramento" },
  { name: "Colorado", abbr: "CO", city: "Denver" },
  { name: "Connecticut", abbr: "CT", city: "Hartford" },
  { name: "Delaware", abbr: "DE", city: "Dover" },
  { name: "Florida", abbr: "FL", city: "Tallahassee" },
  { name: "Georgia", abbr: "GA", city: "Atlanta" },
  { name: "Hawaii", abbr: "HI", city: "Honolulu" },
  { name: "Idaho", abbr: "ID", city: "Boise" },
  { name: "Illinois", abbr: "IL", city: "Springfield" },
  { name: "Indiana", abbr: "IN", city: "Indianapolis" },
  { name: "Iowa", abbr: "IA", city: "Des Moines" },
  { name: "Kansas", abbr: "KS", city: "Topeka" },
  { name: "Kentucky", abbr: "KY", city: "Frankfort" },
  { name: "Louisiana", abbr: "LA", city: "Baton Rouge" },
  { name: "Maine", abbr: "ME", city: "Augusta" },
  { name: "Maryland", abbr: "MD", city: "Annapolis" },
  { name: "Massachusetts", abbr: "MA", city: "Boston" },
  { name: "Michigan", abbr: "MI", city: "Lansing" },
  { name: "Minnesota", abbr: "MN", city: "Saint Paul" },
  { name: "Mississippi", abbr: "MS", city: "Jackson" },
  { name: "Missouri", abbr: "MO", city: "Jefferson City" },
  { name: "Montana", abbr: "MT", city: "Helena" },
  { name: "Nebraska", abbr: "NE", city: "Lincoln" },
  { name: "Nevada", abbr: "NV", city: "Carson City" },
  { name: "New Hampshire", abbr: "NH", city: "Concord" },
  { name: "New Jersey", abbr: "NJ", city: "Trenton" },
  { name: "New Mexico", abbr: "NM", city: "Santa Fe" },
  { name: "New York", abbr: "NY", city: "Albany" },
  { name: "North Carolina", abbr: "NC", city: "Raleigh" },
  { name: "North Dakota", abbr: "ND", city: "Bismarck" },
  { name: "Ohio", abbr: "OH", city: "Columbus" },
  { name: "Oklahoma", abbr: "OK", city: "Oklahoma City" },
  { name: "Oregon", abbr: "OR", city: "Salem" },
  { name: "Pennsylvania", abbr: "PA", city: "Harrisburg" },
  { name: "Rhode Island", abbr: "RI", city: "Providence" },
  { name: "South Carolina", abbr: "SC", city: "Columbia" },
  { name: "South Dakota", abbr: "SD", city: "Pierre" },
  { name: "Tennessee", abbr: "TN", city: "Nashville" },
  { name: "Texas", abbr: "TX", city: "Austin" },
  { name: "Utah", abbr: "UT", city: "Salt Lake City" },
  { name: "Vermont", abbr: "VT", city: "Montpelier" },
  { name: "Virginia", abbr: "VA", city: "Richmond" },
  { name: "Washington", abbr: "WA", city: "Olympia" },
  { name: "West Virginia", abbr: "WV", city: "Charleston" },
  { name: "Wisconsin", abbr: "WI", city: "Madison" },
  { name: "Wyoming", abbr: "WY", city: "Cheyenne" },
] as const;

const STATE_NAME_BY_ABBR = Object.fromEntries(STATE_CAPITALS.map((state) => [state.abbr, state.name])) as Record<string, string>;

type Suggestion = { value: string; label: string; hint?: string };

function normalizeStatePart(input: string) {
  const compact = String(input || "")
    .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
    .trim();
  if (!compact) return "";
  const first = compact.split(/\s+/)[0]?.toUpperCase() || "";
  if (STATE_NAME_BY_ABBR[first]) return STATE_NAME_BY_ABBR[first];
  const match = STATE_CAPITALS.find((state) => state.name.toLowerCase() === compact.toLowerCase());
  return match?.name || compact;
}

function normalizeLocationLabel(input: string) {
  const compact = String(input || "")
    .replace(/,\s*USA$/i, "")
    .replace(/,\s*United States$/i, "")
    .trim();
  const parts = compact.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";

  for (let index = parts.length - 1; index >= 0; index--) {
    const normalizedState = normalizeStatePart(parts[index]);
    const isKnownState = STATE_CAPITALS.some(
      (state) => state.name.toLowerCase() === normalizedState.toLowerCase() || state.abbr.toLowerCase() === normalizedState.toLowerCase(),
    );
    if (!isKnownState) continue;

    const state = normalizedState;
    const cityCandidate = parts[index - 1]?.replace(/\b\d{5}(?:-\d{4})?\b/g, "").trim() || "";
    if (cityCandidate && !/^\d/.test(cityCandidate) && cityCandidate.length > 1) {
      return `${cityCandidate}, ${state}`;
    }
    return state;
  }

  if (parts.length === 1) return parts[0];
  return "";
}

function stateSuggestions(query: string): Suggestion[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return STATE_CAPITALS
    .filter((state) => state.name.toLowerCase().includes(needle) || state.abbr.toLowerCase() === needle)
    .slice(0, 5)
    .map((state) => ({
      value: `${state.city}, ${state.name}`,
      label: `${state.city}, ${state.name}`,
      hint: `Suggested city for ${state.name}`,
    }));
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("leadScraping");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }

  const q = parsed.data.q.trim();
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (suggestion: Suggestion | null | undefined) => {
    if (!suggestion) return;
    const key = suggestion.value.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(suggestion);
  };

  for (const suggestion of stateSuggestions(q)) push(suggestion);

  if (hasPlacesKey()) {
    try {
      const results = await placesTextSearch(q, 8);
      for (const result of results) {
        const label = normalizeLocationLabel(result.formatted_address || result.name || "");
        if (!label) continue;
        push({ value: label, label });
      }
    } catch {
      // Ignore suggestion failures; static state suggestions still provide a deterministic fallback.
    }
  }

  return NextResponse.json({ ok: true, suggestions: out.slice(0, 10) });
}
