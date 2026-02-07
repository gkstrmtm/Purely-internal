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

export function hasPlacesKey() {
  return Boolean(getPlacesKey());
}

export async function placesTextSearch(query: string, limit: number) {
  const key = getPlacesKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchPage = async (pageToken?: string) => {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", query);
    if (pageToken) url.searchParams.set("pagetoken", pageToken);
    url.searchParams.set("key", key);

    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`Places textsearch failed: ${res.status}`);

    const data = (await res.json()) as PlacesTextSearchResponse;
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

export async function placeDetails(placeId: string) {
  const key = getPlacesKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY");

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

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`Places details failed: ${res.status}`);

  const data = (await res.json()) as PlacesDetailsResponse;
  if (data.status && data.status !== "OK") {
    throw new Error(data.error_message || `Places details status: ${data.status}`);
  }

  return data.result ?? {};
}
