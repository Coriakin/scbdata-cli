export type OutputFormat = "list" | "json" | "csv";
export type CacheMode = "read" | "refresh" | "bypass";
export type ElectionType = "riksdag" | "kommun" | "region";

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface CacheEntry<T> {
  source: string;
  fetchedAt: string;
  params: Record<string, unknown>;
  value: T;
}

export interface DeSORecord {
  desoId: string;
  label?: string;
  municipalityCode?: string;
  municipalityName?: string;
  countyCode?: string;
  countyName?: string;
  geometry: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

export interface AddressRecord {
  id: string;
  street: string;
  houseNumber?: string;
  postcode?: string;
  city?: string;
  municipality?: string;
  lat: number;
  lon: number;
  source: "overpass";
}

export interface GeocodeResult {
  query: string;
  displayName: string;
  coordinates: Coordinates;
}

export interface ValdistriktGeometry {
  code: string;
  name: string;
  county: string;
  municipalityCode?: string;
  municipalityName?: string;
  geometry: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

export interface PrecinctVoteRow {
  electionType: ElectionType;
  year: number;
  precinctCode: string;
  precinctName: string;
  municipalityCode?: string;
  municipalityName?: string;
  eligibleVoters?: number;
  totalVotes?: number;
  validVotes?: number;
  turnout?: number;
  partyVotes: Record<string, number>;
}

export interface ValresultatPartyRow {
  party: string;
  votes: number;
  share: number;
  weightedVotes: number;
}

export interface ValresultatRecord {
  desoId: string;
  electionType: ElectionType;
  year: number;
  mappingMethod: "official-precinct-overlap";
  mappedPrecincts: Array<{
    precinctCode: string;
    precinctName: string;
    overlapShare: number;
  }>;
  eligibleVotersEstimate?: number;
  totalVotesEstimate?: number;
  validVotesEstimate?: number;
  turnoutEstimate?: number;
  parties: ValresultatPartyRow[];
}

export interface CommandOptions {
  format: OutputFormat;
  cache: CacheMode;
  output?: string;
  includeGeometry?: boolean;
  debug?: boolean;
}
