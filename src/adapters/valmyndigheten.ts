import AdmZip from "adm-zip";
import { load as loadHtml } from "cheerio";
import * as XLSX from "xlsx";
import type { CacheMode, DeSORecord, ElectionType, PrecinctVoteRow, ValdistriktGeometry, ValresultatRecord } from "../types.js";
import { VAL_STATISTICS_PAGE } from "../config.js";
import { CacheStore } from "../cache.js";
import type { DebugLogger } from "../debug.js";
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
    private readonly cacheStore: CacheStore,
    private readonly debugLogger?: DebugLogger
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
    this.debugLogger?.log(`loaded ${voteRows.size} vote rows for matching`);
    this.debugLogger?.log(`overlapping precinct codes: ${overlaps.map((item) => item.precinct.code).join(", ")}`);
    const parties = new Map<string, number>();
    let eligibleVotersEstimate = 0;
    let totalVotesEstimate = 0;
    let validVotesEstimate = 0;

    for (const overlap of overlaps) {
      const voteRow = voteRows.get(overlap.precinct.code);
      if (!voteRow) {
        this.debugLogger?.log(`no vote row found for precinct ${overlap.precinct.code}`);
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
      this.debugLogger?.log(`using cached Valmyndigheten links for ${electionType} ${year}`);
      return {
        resultsUrl: cached.value.resultsUrl,
        mapUrls: cached.value.mapUrls.filter((url) => isPrecinctZipUrl(url))
      };
    }

    const yearText = String(year);
    for (const sourcePage of rawDataPageCandidates(year)) {
      this.debugLogger?.log(`checking Valmyndigheten source page: ${sourcePage}`);
      const html = await this.httpClient.fetchText(sourcePage);
      const links = extractLinks(html);
      this.debugLogger?.log(`found ${links.length} links on ${sourcePage}`);
      const resultLink = links.find((item) => isMatchingDistrictVotesLink(item.text, electionType, yearText));
      const mapLinks = links.filter((item) => isMatchingMapLink(item.text, item.href, yearText));

      this.debugLogger?.log(
        `result link match: ${resultLink ? resultLink.text : "none"}`
      );
      this.debugLogger?.log(`map link matches: ${mapLinks.length}`);
      if (mapLinks.length > 0) {
        for (const link of mapLinks.slice(0, 5)) {
          this.debugLogger?.log(`map link: ${link.text} -> ${link.href}`);
        }
      }

      if (resultLink && mapLinks.length > 0) {
        const resolved: RawDataLinks = {
          resultsUrl: new URL(resultLink.href, sourcePage).toString(),
          mapUrls: mapLinks.map((item) => new URL(item.href, sourcePage).toString()).filter((url) => isPrecinctZipUrl(url))
        };

        this.debugLogger?.log(`resolved results URL: ${resolved.resultsUrl}`);
        this.debugLogger?.log(`resolved ${resolved.mapUrls.length} map ZIP URLs`);

        await this.cacheStore.set("val-links", params, {
          source: "Valmyndigheten raw data page",
          fetchedAt: new Date().toISOString(),
          params,
          value: resolved
        });
        return resolved;
      }
    }
    this.debugLogger?.log(`no raw-data links matched for ${electionType} ${year}`);
    throw new ValidationError(
      `Unsupported election source combination for ${electionType} ${year}. No matching official raw-data links were found.`
    );
  }

  async loadValdistriktGeometries(cacheMode: CacheMode, zipUrls: string[]): Promise<ValdistriktGeometry[]> {
    const params = { zipUrls };
    const cached = await this.cacheStore.get<ValdistriktGeometry[]>(cacheMode, "valdistrikt-geometries", params);
    if (cached) {
      return cached.value;
    }

    const collections = await Promise.all(
      zipUrls.map(async (zipUrl) => {
        this.debugLogger?.log(`loading precinct geodata zip: ${zipUrl}`);
        if (!isPrecinctZipUrl(zipUrl)) {
          this.debugLogger?.log(`skipping non-precinct zip URL: ${zipUrl}`);
          return [];
        }
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
        this.debugLogger?.log(`found ${geojson.features.length} precinct features in ${zipUrl}`);
        return geojson.features
          .map((feature) => normalizePrecinctGeometry(feature, this.debugLogger))
          .filter((feature): feature is ValdistriktGeometry => feature !== null);
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
    this.debugLogger?.log(`loaded election workbook from ${resultsUrl}`);
    this.debugLogger?.log(`workbook sheets: ${workbook.SheetNames.join(", ")}`);
    const sheetName = selectVoteSheetName(workbook.SheetNames, electionType);
    this.debugLogger?.log(`selected vote sheet: ${sheetName}`);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null });
    this.debugLogger?.log(`parsed ${rows.length} rows from sheet ${sheetName}`);
    if (rows.length > 0) {
      this.debugLogger?.log(`sample vote headers: ${Object.keys(rows[0]).slice(0, 20).join(", ")}`);
    }
    const normalized = normalizeVoteRows(rows, electionType, year);
    this.debugLogger?.log(`normalized ${normalized.length} precinct vote rows`);
    if (normalized.length > 0) {
      this.debugLogger?.log(
        `sample normalized vote row: precinct=${normalized[0].precinctCode}, parties=${Object.keys(normalized[0].partyVotes).slice(0, 10).join(", ")}`
      );
    }

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
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  debugLogger?: DebugLogger
): ValdistriktGeometry | null {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const normalized = normalizedProperties(properties);
  const code =
    stringValue(properties.valdistriktskod) ??
    stringValue(properties.valdistriktkod) ??
    stringValue(properties.distriktskod) ??
    stringValue(properties.Lkfv) ??
    stringValue(properties.id) ??
    stringValue(normalized.valdistriktskod) ??
    stringValue(normalized.valdistriktkod) ??
    stringValue(normalized.valdistrikt_kod) ??
    stringValue(normalized.distriktskod) ??
    stringValue(normalized.lkfv) ??
    stringValue(normalized.id);
  const name =
    stringValue(properties.valdistriktsnamn) ??
    stringValue(properties.valdistrikt) ??
    stringValue(properties.namn) ??
    stringValue(properties.Vdnamn) ??
    stringValue(normalized.valdistriktsnamn) ??
    stringValue(normalized.valdistrikt_namn) ??
    stringValue(normalized.valdistrikt) ??
    stringValue(normalized.namn) ??
    stringValue(normalized.vdnamn) ??
    code ??
    "unknown";
  const county =
    stringValue(properties.lan) ??
    stringValue(properties.lansnamn) ??
    stringValue(normalized.lan) ??
    stringValue(normalized.lansnamn) ??
    stringValue(normalized.lans_namn) ??
    "";

  if (!code) {
    debugLogger?.log(`skipping precinct geometry without recognized code fields: ${Object.keys(properties).join(", ")}`);
    return null;
  }

  return {
    code,
    name,
    county,
    municipalityCode: stringValue(properties.kommunkod) ?? stringValue(normalized.kommunkod),
    municipalityName: stringValue(properties.kommunnamn) ?? stringValue(normalized.kommunnamn),
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
  const precinctCode = stringValue(
    normalized.valdistriktskod ??
      normalized.valdistriktkod ??
      normalized.valdistrikt_kod ??
      normalized.distriktskod ??
      normalized.lkfv
  );
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
    precinctName:
      stringValue(
        normalized.valdistriktsnamn ??
          normalized.valdistrikt_namn ??
          normalized.valdistrikt ??
          normalized.namn ??
          normalized.vdnamn
      ) ?? precinctCode,
    municipalityCode: stringValue(normalized.kommunkod),
    municipalityName: stringValue(normalized.kommunnamn),
    eligibleVoters: numberValue(normalized.rostberattigade),
    totalVotes: numberValue(normalized.avgivna_roster ?? normalized.avgivna_roster_summa),
    validVotes: numberValue(normalized.giltiga_valsedlar ?? normalized.giltiga_roster),
    turnout: numberValue(normalized.valdeltagande),
    partyVotes
  };
}

export function normalizeVoteRows(
  rows: Record<string, unknown>[],
  electionType: ElectionType,
  year: number
): PrecinctVoteRow[] {
  const sample = rows[0] ? normalizeRowHeaders(rows[0]) : null;
  const isLongForm =
    sample !== null &&
    "parti" in sample &&
    ("roster" in sample || "roster_antal" in sample) &&
    ("valdistriktskod" in sample || "lkfv" in sample || "valdistriktkod" in sample);

  if (!isLongForm) {
    return rows
      .map((row) => normalizeVoteRow(row, electionType, year))
      .filter((row): row is PrecinctVoteRow => row !== null);
  }

  return aggregateLongFormVoteRows(rows, electionType, year);
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRowHeaders(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
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

function isMatchingDistrictVotesLink(text: string, electionType: ElectionType, yearText: string): boolean {
  const normalizedText = normalizeMatcherText(text);
  const electionTerms = electionTypeTerms(electionType);

  return (
    normalizedText.includes("roster per distrikt") &&
    normalizedText.includes("slutligt antal roster") &&
    normalizedText.includes(yearText) &&
    electionTerms.some((term) => normalizedText.includes(term))
  );
}

function isMatchingMapLink(text: string, href: string, yearText: string): boolean {
  const normalizedText = normalizeMatcherText(text);
  const normalizedHref = href.toLowerCase();
  return (
    normalizedHref.endsWith(".zip") &&
    !normalizedHref.includes("/parti/") &&
    (
      normalizedText.includes("geodata over valdistrikt") ||
      normalizedText.includes("valdistrikt") ||
      normalizedHref.includes("valdistrikt") ||
      normalizedText.includes(" lan zip") ||
      normalizedText.includes(" län zip")
    ) &&
    (
      normalizedText.includes(yearText) ||
      normalizedHref.includes(yearText) ||
      normalizedHref.includes("/2022/") ||
      normalizedText.includes(" zip")
    )
  );
}

function isPrecinctZipUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.endsWith(".zip") && normalized.includes("valdistrikt") && !normalized.includes("/parti/");
}

function electionTypeTerms(electionType: ElectionType): string[] {
  switch (electionType) {
    case "riksdag":
      return ["riksdagen", "riksdagsval"];
    case "kommun":
      return ["kommunfullmaktige", "kommun"];
    case "region":
      return ["regionfullmaktige", "landstingsfullmaktige", "region", "landsting"];
  }
}

function normalizeMatcherText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function rawDataPageCandidates(year: number): string[] {
  if (year === 2022) {
    return ["https://www.val.se/valresultat/riksdag-region-och-kommun/2022/radata-och-statistik.html", VAL_STATISTICS_PAGE];
  }

  return [VAL_STATISTICS_PAGE];
}

function extractLinks(html: string): Array<{ text: string; href: string }> {
  const $ = loadHtml(html);
  return $("a")
    .toArray()
    .map((element) => {
      const anchor = $(element);
      return {
        text: anchor.text().trim(),
        href: anchor.attr("href")
      };
    })
    .filter((item): item is { text: string; href: string } => Boolean(item.href));
}

function normalizedProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [normalizeHeader(key), value]));
}

function aggregateLongFormVoteRows(
  rows: Record<string, unknown>[],
  electionType: ElectionType,
  year: number
): PrecinctVoteRow[] {
  const grouped = new Map<string, PrecinctVoteRow>();

  for (const rawRow of rows) {
    const row = normalizeRowHeaders(rawRow);
    const precinctCode = stringValue(
      row.valdistriktskod ?? row.valdistriktkod ?? row.valdistrikt_kod ?? row.distriktskod ?? row.lkfv
    );
    if (!precinctCode) {
      continue;
    }

    const precinctName =
      stringValue(row.valdistriktnamn ?? row.valdistriktsnamn ?? row.valdistrikt_namn ?? row.vdnamn ?? row.valdistrikt) ??
      precinctCode;
    const party = stringValue(row.parti);
    const votes = numberValue(row.roster ?? row.roster_antal);

    const existing =
      grouped.get(precinctCode) ??
      {
        electionType,
        year,
        precinctCode,
        precinctName,
        municipalityCode: stringValue(row.kommunkod),
        municipalityName: stringValue(row.kommun),
        eligibleVoters: numberValue(row.rostberattigade),
        totalVotes: numberValue(row.summa_roster ?? row.avgivna_roster ?? row.roster_total),
        validVotes: numberValue(row.giltiga_roster ?? row.giltiga_valsedlar),
        turnout: numberValue(row.valdeltagande),
        partyVotes: {}
      };

    if (existing.eligibleVoters === undefined) {
      existing.eligibleVoters = numberValue(row.rostberattigade);
    }
    if (existing.totalVotes === undefined) {
      existing.totalVotes = numberValue(row.summa_roster ?? row.avgivna_roster ?? row.roster_total);
    }
    if (existing.validVotes === undefined) {
      existing.validVotes = numberValue(row.giltiga_roster ?? row.giltiga_valsedlar);
    }
    if (existing.turnout === undefined) {
      existing.turnout = numberValue(row.valdeltagande);
    }

    if (party && votes !== undefined) {
      existing.partyVotes[party.toUpperCase()] = (existing.partyVotes[party.toUpperCase()] ?? 0) + votes;
    }

    grouped.set(precinctCode, existing);
  }

  return Array.from(grouped.values());
}

export function selectVoteSheetName(sheetNames: string[], electionType: ElectionType): string {
  const preferredPrefixes = voteSheetPrefixes(electionType);
  const preferred = sheetNames.find((sheetName) => {
    const normalized = sheetName.toLowerCase();
    return preferredPrefixes.some((prefix) => normalized.startsWith(prefix));
  });

  if (preferred) {
    return preferred;
  }

  const fallback = sheetNames.find((sheetName) => sheetName.toLowerCase().includes("roster"));
  return fallback ?? sheetNames[0];
}

function voteSheetPrefixes(electionType: ElectionType): string[] {
  switch (electionType) {
    case "riksdag":
      return ["roster_rd"];
    case "kommun":
      return ["roster_kf"];
    case "region":
      return ["roster_rf", "roster_lf"];
  }
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
