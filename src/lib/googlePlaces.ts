type PlacesTextSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
};

type PlacesTextSearchResponse = {
  results?: PlacesTextSearchResult[];
  next_page_token?: string;
  status?: string;
  error_message?: string;
};

type PlacesDetailsResult = {
  name?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  formatted_address?: string;
};

type PlacesDetailsResponse = {
  result?: PlacesDetailsResult;
  status?: string;
  error_message?: string;
};

function getPlacesKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
}

function getRefererHintHeader(): Record<string, string> {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  const value = String(raw || "").trim();
  if (!value) return {};
  return { Referer: value };
}

function normalizeNewPlaceId(placeId: string) {
  const s = String(placeId || "").trim();
  if (!s) return "";
  if (s.startsWith("places/")) return s.slice("places/".length);
  return s;
}

function isProbablyLegacyApiDisabledOrUnauthorized(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("api project is not authorized") ||
    m.includes("not authorized") ||
    m.includes("has not been used in project") ||
    m.includes("has been disabled") ||
    m.includes("api key not valid") ||
    m.includes("this api has not been used") ||
    m.includes("you must enable billing")
  );
}

async function safeReadJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function legacyPlacesTextSearch(query: string, limit: number) {
  const key = getPlacesKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchPage = async (pageToken?: string) => {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", query);
    if (pageToken) url.searchParams.set("pagetoken", pageToken);
    url.searchParams.set("key", key);

    const res = await fetch(url.toString(), { method: "GET", headers: { ...getRefererHintHeader() } });
    const data = (await safeReadJson(res)) as PlacesTextSearchResponse | null;

    if (!res.ok) {
      const msg =
        (data && typeof data.error_message === "string" && data.error_message) ||
        `Places textsearch failed: ${res.status}`;
      throw new Error(msg);
    }

    if (!data) throw new Error("Places textsearch failed: invalid JSON response");
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS" && data.status !== "INVALID_REQUEST") {
      throw new Error(data.error_message || `Places textsearch status: ${data.status}`);
    }
    return data;
  };

  const target = Math.max(1, Math.floor(limit));
  const all: PlacesTextSearchResult[] = [];

  // Text Search returns up to 3 pages (≈60 results). `next_page_token` may require a short delay.
  let page = await fetchPage();
  all.push(...(page.results ?? []));

  while (all.length < target && page.next_page_token) {
    const token = page.next_page_token;

    // Retry for up to ~6s for token to become valid.
    let next: PlacesTextSearchResponse | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(2000);
      const candidate = await fetchPage(token);
      if (candidate.status === "INVALID_REQUEST") continue;
      next = candidate;
      break;
    }

    if (!next) break;
    page = next;
    all.push(...(page.results ?? []));
  }

  const results = all.filter((r) => r.place_id).slice(0, target);
  return results as Array<Required<Pick<PlacesTextSearchResult, "place_id">> & PlacesTextSearchResult>;
}

type NewPlacesSearchTextResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
  }>;
  nextPageToken?: string;
};

async function newPlacesTextSearch(query: string, limit: number) {
  const key = getPlacesKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const target = Math.max(1, Math.floor(limit));
  const all: PlacesTextSearchResult[] = [];

  const fetchPage = async (pageToken?: string) => {
    const url = new URL("https://places.googleapis.com/v1/places:searchText");
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
        // Only request what we use.
        "x-goog-fieldmask": "places.id,places.name,places.displayName,places.formattedAddress,nextPageToken",
        ...getRefererHintHeader(),
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: Math.min(20, Math.max(1, target)), pageToken }),
    });

    const json = (await safeReadJson(res)) as any;
    if (!res.ok) {
      const msg =
        (json && typeof json?.error?.message === "string" && json.error.message) ||
        (json && typeof json?.message === "string" && json.message) ||
        `Places (new) searchText failed: ${res.status}`;
      throw new Error(msg);
    }

    return (json ?? {}) as NewPlacesSearchTextResponse;
  };

  let page = await fetchPage();
  for (const p of page.places ?? []) {
    const rawId = (p as any)?.id || "";
    const rawName = (p as any)?.name || "";
    const placeId = normalizeNewPlaceId(rawId || rawName);
    if (!placeId) continue;
    all.push({ place_id: placeId, name: p.displayName?.text, formatted_address: p.formattedAddress });
  }

  // Best-effort pagination.
  while (all.length < target && page.nextPageToken) {
    const token = page.nextPageToken;
    // Docs note tokens may take a moment.
    await sleep(1500);
    page = await fetchPage(token);
    for (const p of page.places ?? []) {
      const rawId = (p as any)?.id || "";
      const rawName = (p as any)?.name || "";
      const placeId = normalizeNewPlaceId(rawId || rawName);
      if (!placeId) continue;
      all.push({ place_id: placeId, name: p.displayName?.text, formatted_address: p.formattedAddress });
    }
  }

  const results = all.filter((r) => r.place_id).slice(0, target);
  return results as Array<Required<Pick<PlacesTextSearchResult, "place_id">> & PlacesTextSearchResult>;
}

type NewPlacesDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
};

async function newPlaceDetails(placeId: string) {
  const key = getPlacesKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  const normalizedPlaceId = normalizeNewPlaceId(placeId);
  if (!normalizedPlaceId) throw new Error("Missing placeId");

  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedPlaceId)}`);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-goog-api-key": key,
      "x-goog-fieldmask":
        "id,displayName,formattedPhoneNumber,internationalPhoneNumber,websiteUri,formattedAddress",
      ...getRefererHintHeader(),
    },
  });

  const json = (await safeReadJson(res)) as any;
  if (!res.ok) {
    const msg =
      (json && typeof json?.error?.message === "string" && json.error.message) ||
      (json && typeof json?.message === "string" && json.message) ||
      `Places (new) details failed: ${res.status}`;
    throw new Error(msg);
  }

  const data = (json ?? {}) as NewPlacesDetailsResponse;
  return {
    name: data.displayName?.text,
    formatted_phone_number: data.formattedPhoneNumber,
    international_phone_number: data.internationalPhoneNumber,
    website: data.websiteUri,
    formatted_address: data.formattedAddress,
  } satisfies PlacesDetailsResult;
}

export function hasPlacesKey() {
  return Boolean(getPlacesKey());
}

export async function placesTextSearch(query: string, limit: number) {
  // Prefer Places API (New) first since that's what Google is migrating toward.
  try {
    return await newPlacesTextSearch(query, limit);
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "";
    if (msg && !isProbablyLegacyApiDisabledOrUnauthorized(msg)) throw e;
    return await legacyPlacesTextSearch(query, limit);
  }
}

export async function placeDetails(placeId: string) {
  const key = getPlacesKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  // If placeId already looks like a new Places resource id, go straight to the new API.
  if (placeId.startsWith("places/")) return await newPlaceDetails(placeId);

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set(
      "fields",
      [
        "name",
        "formatted_phone_number",
        "international_phone_number",
        "website",
        "formatted_address",
      ].join(","),
    );
    url.searchParams.set("key", key);

    const res = await fetch(url.toString(), { method: "GET", headers: { ...getRefererHintHeader() } });
    const data = (await safeReadJson(res)) as PlacesDetailsResponse | null;

    if (!res.ok) {
      const msg =
        (data && typeof data.error_message === "string" && data.error_message) ||
        `Places details failed: ${res.status}`;
      throw new Error(msg);
    }

    if (!data) throw new Error("Places details failed: invalid JSON response");
    if (data.status && data.status !== "OK") {
      throw new Error(data.error_message || `Places details status: ${data.status}`);
    }

    return data.result ?? {};
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "";
    if (msg && !isProbablyLegacyApiDisabledOrUnauthorized(msg)) throw e;
    return await newPlaceDetails(placeId);
  }
}
