import { SUPPORTED_ELECTION_TYPES } from "../config.js";
import type { CacheMode, Coordinates, ElectionType, OutputFormat } from "../types.js";
import { ValidationError } from "../errors.js";

export function parseLatitude(value: string): number {
  const lat = Number(value);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new ValidationError(`Invalid latitude: ${value}`);
  }
  return lat;
}

export function parseLongitude(value: string): number {
  const lon = Number(value);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new ValidationError(`Invalid longitude: ${value}`);
  }
  return lon;
}

export function validateCoordinates(lat: number, lon: number): Coordinates {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new ValidationError(`Invalid latitude: ${lat}`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new ValidationError(`Invalid longitude: ${lon}`);
  }
  return { lat, lon };
}

export function validateDeSOId(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}[A-C]\d{4}$/.test(normalized)) {
    throw new ValidationError(`Invalid DeSO ID: ${value}`);
  }
  return normalized;
}

export function validateOutputFormat(value: string): OutputFormat {
  if (value !== "list" && value !== "json" && value !== "csv") {
    throw new ValidationError(`Unsupported output format: ${value}`);
  }
  return value;
}

export function validateCacheMode(value: string): CacheMode {
  if (value !== "read" && value !== "refresh" && value !== "bypass") {
    throw new ValidationError(`Unsupported cache mode: ${value}`);
  }
  return value;
}

export function validateElectionType(value: string): ElectionType {
  if (!SUPPORTED_ELECTION_TYPES.includes(value as ElectionType)) {
    throw new ValidationError(`Unsupported election type: ${value}`);
  }
  return value as ElectionType;
}

export function validateElectionYear(value: string): number {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2006 || year > 2100) {
    throw new ValidationError(`Unsupported election year: ${value}`);
  }
  return year;
}
