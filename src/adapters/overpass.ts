import bbox from "@turf/bbox";
import type { CacheMode, AddressRecord, DeSORecord } from "../types.js";
import { OVERPASS_ENDPOINT } from "../config.js";
import { CacheStore } from "../cache.js";
import { HttpClient } from "../http.js";
import { pointInFeature } from "../utils/geo.js";

interface OverpassResponse {
  elements: Array<{
    id: number;
    type: string;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }>;
}

export class OverpassAdapter {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly cacheStore: CacheStore
  ) {}

  async getAddressesInDeSO(cacheMode: CacheMode, deso: DeSORecord): Promise<AddressRecord[]> {
    const params = { desoId: deso.desoId };
    const cached = await this.cacheStore.get<AddressRecord[]>(cacheMode, "addresses", params);
    if (cached) {
      return cached.value;
    }

    const [minLon, minLat, maxLon, maxLat] = bbox(deso.geometry);
    const query = `
[out:json][timeout:60];
(
  node["addr:housenumber"](${minLat},${minLon},${maxLat},${maxLon});
  way["addr:housenumber"](${minLat},${minLon},${maxLat},${maxLon});
  relation["addr:housenumber"](${minLat},${minLon},${maxLat},${maxLon});
);
out center tags;
    `.trim();

    const response = await this.httpClient.fetchJson<OverpassResponse>(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: query
    });

    const addresses = response.elements
      .map((element) => normalizeOverpassElement(element))
      .filter((record): record is AddressRecord => record !== null)
      .filter((record) => pointInFeature(deso.geometry, record.lon, record.lat))
      .sort(
        (left, right) =>
          left.street.localeCompare(right.street) || (left.houseNumber ?? "").localeCompare(right.houseNumber ?? "")
      );

    await this.cacheStore.set("addresses", params, {
      source: "OpenStreetMap Overpass",
      fetchedAt: new Date().toISOString(),
      params,
      value: addresses
    });
    return addresses;
  }
}

export function normalizeOverpassElement(
  element: OverpassResponse["elements"][number]
): AddressRecord | null {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined || !tags["addr:street"]) {
    return null;
  }

  return {
    id: `${element.type}/${element.id}`,
    street: tags["addr:street"],
    houseNumber: tags["addr:housenumber"],
    postcode: tags["addr:postcode"],
    city: tags["addr:city"] ?? tags["addr:town"] ?? tags["addr:place"],
    municipality: tags["addr:municipality"],
    lat,
    lon,
    source: "overpass"
  };
}
