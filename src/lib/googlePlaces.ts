type PlacesTextSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
};

type PlacesTextSearchResponse = {
  results?: PlacesTextSearchResult[];
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

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`Places textsearch failed: ${res.status}`);

  const data = (await res.json()) as PlacesTextSearchResponse;
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(data.error_message || `Places textsearch status: ${data.status}`);
  }

  const results = (data.results ?? []).filter((r) => r.place_id).slice(0, Math.max(1, limit));
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
