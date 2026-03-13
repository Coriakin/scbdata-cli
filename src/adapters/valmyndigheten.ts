import AdmZip from "adm-zip";
import area from "@turf/area";
import { load as loadHtml } from "cheerio";
import * as XLSX from "xlsx";
import type { CacheMode, DeSORecord, ElectionType, PrecinctVoteRow, ValdistriktGeometry, ValresultatRecord } from "../types.js";
import { VAL_RAW_DATA_PAGE } from "../config.js";
import { CacheStore } from "../cache.js";
import { HttpClient } from "../http.js";
import { NotFoundError, RemoteSourceError, ValidationError } from "../errors.js";
import { overlapRatio, toWgs84 } from "../utils/geo.js";

interface RawDataLinks {
  resultsUrl: string;
  mapUrls: string[];
}

export class ValmyndighetenAdapter {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly cacheStore: CacheStore
  ) {}

  async getValresultatForDeSO(
    cacheMode: CacheMode,
    deso: DeSORecord,
    electionType: ElectionType,
    year: number
  ): Promise<ValresultatRecord> {
    const params = { desoId: deso.desoId, electionType, year };
    const cached = await this.cacheStore.get<ValresultatRecord>(cacheMode, "valresultat", params);
    if (cached) {
      return cached.value;
    }

    const links = await this.resolveRawDataLinks(cacheMode, electionType, year);
    const [precincts, votes] = await Promise.all([
      this.loadValdistriktGeometries(cacheMode, links.mapUrls),
      this.loadPrecinctVotes(cacheMode, links.resultsUrl, electionType, year)
    ]);

    const overlaps = precincts
      .map((precinct) => ({
        precinct,
        overlapShare: overlapRatio(deso.geometry, precinct.geometry)
      }))
      .filter((item) => item.overlapShare > 0.001)
      .sort((left, right) => right.overlapShare - left.overlapShare);

    if (overlaps.length === 0) {
      throw new NotFoundError(`No election precinct overlap found for ${deso.desoId}.`);
    }

    const voteRows = new Map(votes.map((row) => [row.precinctCode, row]));
    const parties = new Map<string, number>();
    let eligibleVotersEstimate = 0;
    let totalVotesEstimate = 0;
    let validVotesEstimate = 0;

    for (const overlap of overlaps) {
      const voteRow = voteRows.get(overlap.precinct.code);
      if (!voteRow) {
        continue;
      }

      eligibleVotersEstimate += (voteRow.eligibleVoters ?? 0) * overlap.overlapShare;
      totalVotesEstimate += (voteRow.totalVotes ?? 0) * overlap.overlapShare;
      validVotesEstimate += (voteRow.validVotes ?? 0) * overlap.overlapShare;

      for (const [party, partyVotes] of Object.entries(voteRow.partyVotes)) {
        parties.set(party, (parties.get(party) ?? 0) + partyVotes * overlap.overlapShare);
      }
    }

    const totalWeightedVotes = Array.from(parties.values()).reduce((sum, value) => sum + value, 0);
    const result: ValresultatRecord = {
      desoId: deso.desoId,
      electionType,
      year,
      mappingMethod: "official-precinct-overlap",
      mappedPrecincts: overlaps.map((overlap) => ({
        precinctCode: overlap.precinct.code,
        precinctName: overlap.precinct.name,
        overlapShare: round(overlap.overlapShare)
      })),
      eligibleVotersEstimate: round(eligibleVotersEstimate),
      totalVotesEstimate: round(totalVotesEstimate),
      validVotesEstimate: round(validVotesEstimate),
      turnoutEstimate: eligibleVotersEstimate > 0 ? round(totalVotesEstimate / eligibleVotersEstimate) : undefined,
      parties: Array.from(parties.entries())
        .map(([party, weightedVotes]) => ({
          party,
          votes: round(weightedVotes),
          weightedVotes: round(weightedVotes),
          share: totalWeightedVotes > 0 ? round(weightedVotes / totalWeightedVotes) : 0
        }))
        .sort((left, right) => right.weightedVotes - left.weightedVotes)
    };

    await this.cacheStore.set("valresultat", params, {
      source: "Valmyndigheten raw data",
      fetchedAt: new Date().toISOString(),
      params,
      value: result
    });
    return result;
  }

  async resolveRawDataLinks(cacheMode: CacheMode, electionType: ElectionType, year: number): Promise<RawDataLinks> {
    const params = { electionType, year };
    const cached = await this.cacheStore.get<RawDataLinks>(cacheMode, "val-links", params);
    if (cached) {
      return cached.value;
    }

    const html = await this.httpClient.fetchText(VAL_RAW_DATA_PAGE);
    const $ = loadHtml(html);
    const links = $("a")
      .toArray()
      .map((element) => {
        const anchor = $(element);
        return {
          text: anchor.text().trim(),
          href: anchor.attr("href")
        };
      })
      .filter((item): item is { text: string; href: string } => Boolean(item.href));

    const normalizedType = electionType.toLowerCase();
    const yearText = String(year);
    const resultLink = links.find((item) => {
      return (
        /slutligt valresultat/i.test(item.text) &&
        new RegExp(normalizedType, "i").test(item.text) &&
        item.href.toLowerCase().includes(yearText)
      );
    });

    const mapLinks = links.filter((item) => {
      return /geodata över valdistrikt/i.test(item.text) && item.href.toLowerCase().includes(yearText);
    });

    if (!resultLink || mapLinks.length === 0) {
      throw new ValidationError(
        `Unsupported election source combination for ${electionType} ${year}. No matching official raw-data links were found.`
      );
    }

    const resolved: RawDataLinks = {
      resultsUrl: new URL(resultLink.href, VAL_RAW_DATA_PAGE).toString(),
      mapUrls: mapLinks.map((item) => new URL(item.href, VAL_RAW_DATA_PAGE).toString())
    };

    await this.cacheStore.set("val-links", params, {
      source: "Valmyndigheten raw data page",
      fetchedAt: new Date().toISOString(),
      params,
      value: resolved
    });
    return resolved;
  }

  async loadValdistriktGeometries(cacheMode: CacheMode, zipUrls: string[]): Promise<ValdistriktGeometry[]> {
    const params = { zipUrls };
    const cached = await this.cacheStore.get<ValdistriktGeometry[]>(cacheMode, "valdistrikt-geometries", params);
    if (cached) {
      return cached.value;
    }

    const collections = await Promise.all(
      zipUrls.map(async (zipUrl) => {
        const buffer = Buffer.from(await this.httpClient.fetchArrayBuffer(zipUrl));
        const zip = new AdmZip(buffer);
        const geoJsonEntry = zip
          .getEntries()
          .find((entry) => entry.entryName.toLowerCase().endsWith(".geojson") || entry.entryName.toLowerCase().endsWith(".json"));

        if (!geoJsonEntry) {
          throw new RemoteSourceError(`No GeoJSON file found in ${zipUrl}`);
        }

        const geojson = JSON.parse(zip.readAsText(geoJsonEntry)) as GeoJSON.FeatureCollection<
          GeoJSON.Polygon | GeoJSON.MultiPolygon
        >;
        return geojson.features.map((feature) => normalizePrecinctGeometry(feature));
      })
    );

    const flattened = collections.flat();
    await this.cacheStore.set("valdistrikt-geometries", params, {
      source: "Valmyndigheten precinct geodata",
      fetchedAt: new Date().toISOString(),
      params,
      value: flattened
    });
    return flattened;
  }

  async loadPrecinctVotes(
    cacheMode: CacheMode,
    resultsUrl: string,
    electionType: ElectionType,
    year: number
  ): Promise<PrecinctVoteRow[]> {
    const params = { resultsUrl, electionType, year };
    const cached = await this.cacheStore.get<PrecinctVoteRow[]>(cacheMode, "precinct-votes", params);
    if (cached) {
      return cached.value;
    }

    const buffer = Buffer.from(await this.httpClient.fetchArrayBuffer(resultsUrl));
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null });
    const normalized = rows
      .map((row) => normalizeVoteRow(row, electionType, year))
      .filter((row): row is PrecinctVoteRow => row !== null);

    await this.cacheStore.set("precinct-votes", params, {
      source: "Valmyndigheten election results",
      fetchedAt: new Date().toISOString(),
      params,
      value: normalized
    });
    return normalized;
  }
}

export function normalizePrecinctGeometry(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
): ValdistriktGeometry {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const code =
    stringValue(properties.valdistriktskod) ??
    stringValue(properties.valdistriktkod) ??
    stringValue(properties.distriktskod) ??
    stringValue(properties.id);
  const name =
    stringValue(properties.valdistriktsnamn) ??
    stringValue(properties.valdistrikt) ??
    stringValue(properties.namn) ??
    code ??
    "unknown";
  const county = stringValue(properties.lan) ?? stringValue(properties.lansnamn) ?? "";

  if (!code) {
    throw new RemoteSourceError("Valdistrikt geometry is missing a code.");
  }

  return {
    code,
    name,
    county,
    municipalityCode: stringValue(properties.kommunkod),
    municipalityName: stringValue(properties.kommunnamn),
    geometry: maybeReprojectFeature(feature)
  };
}

export function normalizeVoteRow(
  row: Record<string, unknown>,
  electionType: ElectionType,
  year: number
): PrecinctVoteRow | null {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  ) as Record<string, unknown>;
  const precinctCode = stringValue(normalized.valdistriktskod ?? normalized.valdistriktkod ?? normalized.distriktskod);
  if (!precinctCode) {
    return null;
  }

  const partyVotes: Record<string, number> = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (key.startsWith("rost_") || key.startsWith("roster_")) {
      const party = key.replace(/^rost(er)?_/, "").toUpperCase();
      const numericValue = numberValue(value);
      if (numericValue !== undefined) {
        partyVotes[party] = numericValue;
      }
    }
  }

  return {
    electionType,
    year,
    precinctCode,
    precinctName: stringValue(normalized.valdistriktsnamn ?? normalized.valdistrikt ?? normalized.namn) ?? precinctCode,
    municipalityCode: stringValue(normalized.kommunkod),
    municipalityName: stringValue(normalized.kommunnamn),
    eligibleVoters: numberValue(normalized.rostberattigade),
    totalVotes: numberValue(normalized.avgivna_roster ?? normalized.avgivna_roster_summa),
    validVotes: numberValue(normalized.giltiga_valsedlar ?? normalized.giltiga_roster),
    turnout: numberValue(normalized.valdeltagande),
    partyVotes
  };
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const normalized = value.replace(/\s+/g, "").replace(",", ".");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function maybeReprojectFeature(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const sample = feature.geometry.type === "Polygon"
    ? feature.geometry.coordinates[0]?.[0]
    : feature.geometry.coordinates[0]?.[0]?.[0];

  if (!sample || Math.abs(sample[0]) <= 180) {
    return feature;
  }

  if (feature.geometry.type === "Polygon") {
    return {
      ...feature,
      geometry: {
        type: "Polygon",
        coordinates: feature.geometry.coordinates.map((ring) =>
          ring.map(([x, y]) => toWgs84(x, y))
        )
      }
    };
  }

  return {
    ...feature,
    geometry: {
      type: "MultiPolygon",
      coordinates: feature.geometry.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(([x, y]) => toWgs84(x, y)))
      )
    }
  };
}
