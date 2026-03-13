import type { CacheMode, Coordinates, DeSORecord } from "../types.js";
import { SCB_DESO_LAYERS, SCB_WFS_ENDPOINT, WGS84 } from "../config.js";
import { CacheStore } from "../cache.js";
import { HttpClient } from "../http.js";
import { NotFoundError, RemoteSourceError } from "../errors.js";
import { pointInFeature } from "../utils/geo.js";

interface ScbSchema {
  typeName: string;
  desoField: string;
  municipalityCodeField?: string;
  municipalityNameField?: string;
  countyCodeField?: string;
  countyNameField?: string;
}

interface WfsFeatureCollection {
  type: "FeatureCollection";
  features: Array<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>;
}

export class ScbWfsAdapter {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly cacheStore: CacheStore
  ) {}

  async resolveDeSOByCoordinates(cacheMode: CacheMode, coordinates: Coordinates): Promise<DeSORecord> {
    const schema = await this.getSchema(cacheMode);
    const delta = 0.02;
    const bbox = [
      coordinates.lon - delta,
      coordinates.lat - delta,
      coordinates.lon + delta,
      coordinates.lat + delta,
      WGS84
    ].join(",");
    const url = new URL(SCB_WFS_ENDPOINT);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeNames", schema.typeName);
    url.searchParams.set("outputFormat", "application/json");
    url.searchParams.set("srsName", WGS84);
    url.searchParams.set("bbox", bbox);

    const result = await this.httpClient.fetchJson<WfsFeatureCollection>(url.toString());
    const match = result.features.find((feature) => pointInFeature(feature, coordinates.lon, coordinates.lat));
    if (!match) {
      throw new NotFoundError("No DeSO found for the given coordinates.");
    }
    return this.toDeSORecord(schema, match);
  }

  async getDeSOById(cacheMode: CacheMode, desoId: string): Promise<DeSORecord> {
    const cached = await this.cacheStore.get<DeSORecord>(cacheMode, "deso-by-id", { desoId });
    if (cached) {
      return cached.value;
    }

    const schema = await this.getSchema(cacheMode);
    const url = new URL(SCB_WFS_ENDPOINT);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeNames", schema.typeName);
    url.searchParams.set("outputFormat", "application/json");
    url.searchParams.set("srsName", WGS84);
    url.searchParams.set("cql_filter", `${schema.desoField}='${desoId}'`);

    const result = await this.httpClient.fetchJson<WfsFeatureCollection>(url.toString());
    const feature = result.features[0];
    if (!feature) {
      throw new NotFoundError(`No DeSO found for ${desoId}.`);
    }

    const record = this.toDeSORecord(schema, feature);
    await this.cacheStore.set("deso-by-id", { desoId }, this.buildCacheEntry("SCB WFS", { desoId }, record));
    return record;
  }

  async getSchema(cacheMode: CacheMode): Promise<ScbSchema> {
    const cached = await this.cacheStore.get<ScbSchema>(cacheMode, "scb-schema", {});
    if (cached) {
      return cached.value;
    }
    const schema = await this.resolveKnownSchema();

    await this.cacheStore.set("scb-schema", {}, this.buildCacheEntry("SCB WFS", {}, schema));
    return schema;
  }

  private toDeSORecord(
    schema: ScbSchema,
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
  ): DeSORecord {
    const properties = feature.properties as Record<string, string | undefined> | null;
    const desoId = properties?.[schema.desoField];
    if (!desoId) {
      throw new RemoteSourceError("SCB WFS returned a feature without a DeSO identifier.");
    }

    return {
      desoId,
      label: properties?.namn ?? properties?.NAME,
      municipalityCode: schema.municipalityCodeField ? properties?.[schema.municipalityCodeField] : undefined,
      municipalityName: schema.municipalityNameField ? properties?.[schema.municipalityNameField] : undefined,
      countyCode: schema.countyCodeField ? properties?.[schema.countyCodeField] : undefined,
      countyName: schema.countyNameField ? properties?.[schema.countyNameField] : undefined,
      geometry: feature
    };
  }

  private async resolveKnownSchema(): Promise<ScbSchema> {
    for (const layer of SCB_DESO_LAYERS) {
      const url = new URL(SCB_WFS_ENDPOINT);
      url.searchParams.set("service", "WFS");
      url.searchParams.set("version", "2.0.0");
      url.searchParams.set("request", "GetFeature");
      url.searchParams.set("typeNames", layer);
      url.searchParams.set("outputFormat", "application/json");
      url.searchParams.set("srsName", WGS84);
      url.searchParams.set("count", "1");

      try {
        const result = await this.httpClient.fetchJson<WfsFeatureCollection>(url.toString());
        const feature = result.features[0];
        const properties = (feature?.properties ?? {}) as Record<string, unknown>;
        if (!feature) {
          continue;
        }

        const fieldNames = Object.keys(properties);
        const desoField =
          fieldNames.find((name) => /^desokod$/i.test(name)) ??
          fieldNames.find((name) => /^deso$/i.test(name) || /deso.*id/i.test(name));

        if (!desoField) {
          continue;
        }

        return {
          typeName: layer,
          desoField,
          municipalityCodeField: fieldNames.find((name) => /kommun.*kod/i.test(name)),
          municipalityNameField: fieldNames.find((name) => /kommun.*namn/i.test(name)),
          countyCodeField: fieldNames.find((name) => /lan.*kod/i.test(name)),
          countyNameField: fieldNames.find((name) => /lan.*namn/i.test(name))
        };
      } catch {
        continue;
      }
    }

    throw new RemoteSourceError("Could not discover a working DeSO layer from SCB WFS.");
  }

  private buildCacheEntry<T>(source: string, params: Record<string, unknown>, value: T) {
    return {
      source,
      fetchedAt: new Date().toISOString(),
      params,
      value
    };
  }
}
