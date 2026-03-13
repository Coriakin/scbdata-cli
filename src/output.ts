import fs from "node:fs/promises";
import type { OutputFormat } from "./types.js";
import { serializeCsv } from "./utils/csv.js";

export async function writeOutput(
  data: unknown,
  format: OutputFormat,
  outputPath?: string
): Promise<void> {
  const text = formatOutput(data, format);
  if (outputPath) {
    await fs.writeFile(outputPath, text, "utf8");
    return;
  }
  process.stdout.write(text);
}

export function formatOutput(data: unknown, format: OutputFormat): string {
  if (format === "json") {
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  if (format === "csv") {
    const rows = Array.isArray(data) ? data : [flattenObject(data)];
    return serializeCsv(rows.map((row) => flattenObject(row)));
  }

  return formatList(data);
}

function formatList(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "No results.\n";
    }
    return `${data.map((row) => formatStructuredValue(row, 0).trimEnd()).join("\n\n")}\n`;
  }

  return `${formatStructuredValue(data, 0)}\n`;
}

function formatScalar(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatScalar(item)).join("; ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value === undefined ? "" : String(value);
}

function formatStructuredValue(value: unknown, indent: number): string {
  const prefix = "  ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${prefix}[]`;
    }

    return value
      .map((item) => {
        const rendered = formatStructuredValue(item, indent + 1);
        const trimmed = rendered.startsWith(`${"  ".repeat(indent + 1)}`)
          ? rendered.slice(("  ".repeat(indent + 1)).length)
          : rendered;
        if (trimmed.includes("\n")) {
          return `${prefix}-\n${rendered}`;
        }
        return `${prefix}- ${trimmed}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    if (isGeoJsonFeature(value)) {
      const summary = summarizeGeoJsonFeature(value);
      return Object.entries(summary)
        .map(([key, entry]) => `${prefix}${key}: ${entry}`)
        .join("\n");
    }

    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        if (entry && typeof entry === "object") {
          return `${prefix}${key}:\n${formatStructuredValue(entry, indent + 1)}`;
        }
        return `${prefix}${key}: ${formatScalar(entry)}`;
      })
      .join("\n");
  }

  return `${prefix}${String(value ?? "")}`;
}

function isGeoJsonFeature(value: unknown): value is {
  type: "Feature";
  geometry?: { type?: string; coordinates?: unknown };
  id?: string;
  properties?: Record<string, unknown>;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      (value as { type?: unknown }).type === "Feature" &&
      "geometry" in value
  );
}

function summarizeGeoJsonFeature(value: {
  geometry?: { type?: string; coordinates?: unknown };
  id?: string;
  properties?: Record<string, unknown>;
}): Record<string, string> {
  const summary: Record<string, string> = {
    type: "Feature"
  };

  if (value.id !== undefined) {
    summary.id = String(value.id);
  }

  if (value.geometry?.type) {
    summary.geometryType = value.geometry.type;
  }

  if (value.properties && Object.keys(value.properties).length > 0) {
    summary.properties = JSON.stringify(value.properties);
  }

  return summary;
}

function flattenObject(data: unknown, prefix = ""): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return prefix ? { [prefix]: data } : { value: data };
  }

  const entries = Object.entries(data as Record<string, unknown>);
  return entries.reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(accumulator, flattenObject(value, nextKey));
    } else {
      accumulator[nextKey] = value;
    }
    return accumulator;
  }, {});
}
