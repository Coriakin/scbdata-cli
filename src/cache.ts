import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CACHE_DIR } from "./config.js";
import type { CacheEntry, CacheMode } from "./types.js";
import { createCacheKey } from "./utils/cache-key.js";

export class CacheStore {
  constructor(private readonly rootDir = DEFAULT_CACHE_DIR) {}

  async get<T>(mode: CacheMode, namespace: string, params: Record<string, unknown>): Promise<CacheEntry<T> | null> {
    if (mode === "bypass" || mode === "refresh") {
      return null;
    }

    try {
      const filePath = this.buildPath(namespace, params);
      const contents = await fs.readFile(filePath, "utf8");
      return JSON.parse(contents) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  async set<T>(namespace: string, params: Record<string, unknown>, entry: CacheEntry<T>): Promise<void> {
    const filePath = this.buildPath(namespace, params);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf8");
  }

  private buildPath(namespace: string, params: Record<string, unknown>): string {
    const key = createCacheKey(namespace, params);
    return path.join(this.rootDir, namespace, `${key}.json`);
  }
}
