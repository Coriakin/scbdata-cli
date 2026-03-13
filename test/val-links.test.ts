import { describe, expect, it, vi } from "vitest";
import { ValmyndighetenAdapter } from "../src/adapters/valmyndigheten.js";
import { CacheStore } from "../src/cache.js";
import { HttpClient } from "../src/http.js";

describe("ValmyndighetenAdapter.resolveRawDataLinks", () => {
  it("finds result and map links from the raw-data page", async () => {
    const httpClient = new HttpClient(0);
    vi.spyOn(httpClient, "fetchText").mockResolvedValue(`
      <html>
        <body>
          <a href="/downloads/2022/slutligt-valresultat-riksdagen.xlsx">Slutligt valresultat för val till riksdagen 2022 xlsx</a>
          <a href="/downloads/2022/l1_geodata-over-valdistrikt-i-val-2022.zip">L1 Geodata över valdistrikt i val 2022 zip</a>
        </body>
      </html>
    `);

    const adapter = new ValmyndighetenAdapter(httpClient, new CacheStore("/tmp/scbdata-test-cache"));
    const links = await adapter.resolveRawDataLinks("bypass", "riksdag", 2022);

    expect(links.resultsUrl).toContain("slutligt-valresultat-riksdagen.xlsx");
    expect(links.mapUrls[0]).toContain("l1_geodata-over-valdistrikt-i-val-2022.zip");
  });
});
