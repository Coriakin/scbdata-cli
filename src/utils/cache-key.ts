import crypto from "node:crypto";

export function createCacheKey(namespace: string, params: Record<string, unknown>): string {
  const normalized = JSON.stringify(sortValue(params));
  const hash = crypto.createHash("sha256").update(`${namespace}:${normalized}`).digest("hex");
  return `${namespace}-${hash}`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortValue(entry)])
    );
  }
  return value;
}
