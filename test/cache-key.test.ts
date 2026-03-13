import { describe, expect, it } from "vitest";
import { createCacheKey } from "../src/utils/cache-key.js";

describe("createCacheKey", () => {
  it("is stable across object key ordering", () => {
    const left = createCacheKey("deso", { b: 2, a: 1 });
    const right = createCacheKey("deso", { a: 1, b: 2 });
    expect(left).toBe(right);
  });
});
