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
          <a href="/downloads/2022/roster-per-distrikt-riksdagen.xlsx">Röster per distrikt, slutligt antal röster, inklusive totalt valdeltagande, riksdagsvalet 2022 xlsx</a>
          <a href="/downloads/2022/l1_geodata-over-valdistrikt-i-val-2022.zip">L1 Geodata över valdistrikt i val 2022 zip</a>
        </body>
      </html>
    `);

    const adapter = new ValmyndighetenAdapter(httpClient, new CacheStore("/tmp/scbdata-test-cache"));
    const links = await adapter.resolveRawDataLinks("bypass", "riksdag", 2022);

    expect(links.resultsUrl).toContain("roster-per-distrikt-riksdagen.xlsx");
    expect(links.mapUrls[0]).toContain("l1_geodata-over-valdistrikt-i-val-2022.zip");
  });

  it("matches links even when the year only appears in link text", async () => {
    const httpClient = new HttpClient(0);
    vi.spyOn(httpClient, "fetchText").mockResolvedValue(`
      <html>
        <body>
          <a href="/download/riksdag-resultat.xlsx">Röster per distrikt, slutligt antal röster, inklusive totalt valdeltagande, riksdagsvalet 2022 xlsx</a>
          <a href="/download/valdistrikt-l1.zip">L1 Geodata över valdistrikt i val 2022 zip</a>
        </body>
      </html>
    `);

    const adapter = new ValmyndighetenAdapter(httpClient, new CacheStore("/tmp/scbdata-test-cache-2"));
    const links = await adapter.resolveRawDataLinks("bypass", "riksdag", 2022);

    expect(links.resultsUrl).toContain("/download/riksdag-resultat.xlsx");
    expect(links.mapUrls[0]).toContain("/download/valdistrikt-l1.zip");
  });

  it("matches county zip map links used on the 2022 page", async () => {
    const httpClient = new HttpClient(0);
    vi.spyOn(httpClient, "fetchText").mockResolvedValue(`
      <html>
        <body>
          <a href="/download/riksdag-resultat.xlsx">Röster per distrikt, slutligt antal röster, inklusive totalt valdeltagande, riksdagsvalet 2022 xlsx</a>
          <a href="/download/valdistrikt-stockholm.zip">Stockholms län zip</a>
        </body>
      </html>
    `);

    const adapter = new ValmyndighetenAdapter(httpClient, new CacheStore("/tmp/scbdata-test-cache-3"));
    const links = await adapter.resolveRawDataLinks("bypass", "riksdag", 2022);

    expect(links.resultsUrl).toContain("/download/riksdag-resultat.xlsx");
    expect(links.mapUrls[0]).toContain("/download/valdistrikt-stockholm.zip");
  });
});
