import type { CacheMode, GeocodeResult } from "../types.js";
import { NOMINATIM_ENDPOINT } from "../config.js";
import { AmbiguousResultError, NotFoundError } from "../errors.js";
import { CacheStore } from "../cache.js";
import { HttpClient } from "../http.js";

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
}

export class NominatimAdapter {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly cacheStore: CacheStore
  ) {}

  async geocode(cacheMode: CacheMode, query: string): Promise<GeocodeResult> {
    const params = { query };
    const cached = await this.cacheStore.get<GeocodeResult>(cacheMode, "geocode", params);
    if (cached) {
      return cached.value;
    }

    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "se");
    url.searchParams.set("limit", "3");
    const response = await this.httpClient.fetchJson<NominatimItem[]>(url.toString());
    if (response.length === 0) {
      throw new NotFoundError(`No address match found for "${query}".`);
    }
    if (response.length > 1) {
      throw new AmbiguousResultError(`Address lookup for "${query}" returned multiple matches.`);
    }

    const first = response[0];
    const result: GeocodeResult = {
      query,
      displayName: first.display_name,
      coordinates: {
        lat: Number(first.lat),
        lon: Number(first.lon)
      }
    };

    await this.cacheStore.set("geocode", params, {
      source: "OpenStreetMap Nominatim",
      fetchedAt: new Date().toISOString(),
      params,
      value: result
    });
    return result;
  }
}
