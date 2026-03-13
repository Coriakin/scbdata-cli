import type { CacheMode, DeSORecord } from "../types.js";
import { NominatimAdapter } from "../adapters/nominatim.js";
import { ScbWfsAdapter } from "../adapters/scb.js";
import type { ProgressReporter } from "../progress.js";

export class DeSOService {
  constructor(
    private readonly scbAdapter: ScbWfsAdapter,
    private readonly nominatimAdapter: NominatimAdapter
  ) {}

  async fromCoordinates(
    cacheMode: CacheMode,
    lat: number,
    lon: number,
    progress?: ProgressReporter
  ): Promise<DeSORecord> {
    if (!progress) {
      return this.scbAdapter.resolveDeSOByCoordinates(cacheMode, { lat, lon });
    }
    return progress.runStep("Resolving DeSO from coordinates", () =>
      this.scbAdapter.resolveDeSOByCoordinates(cacheMode, { lat, lon })
    );
  }

  async fromAddress(cacheMode: CacheMode, query: string, progress?: ProgressReporter): Promise<DeSORecord> {
    const geocode = progress
      ? await progress.runStep("Geocoding address with Nominatim", () =>
          this.nominatimAdapter.geocode(cacheMode, query)
        )
      : await this.nominatimAdapter.geocode(cacheMode, query);

    progress?.info(`Matched address: ${geocode.displayName}`);

    if (!progress) {
      return this.scbAdapter.resolveDeSOByCoordinates(cacheMode, geocode.coordinates);
    }

    return progress.runStep("Resolving DeSO from geocoded coordinates", () =>
      this.scbAdapter.resolveDeSOByCoordinates(cacheMode, geocode.coordinates)
    );
  }

  async byId(cacheMode: CacheMode, desoId: string, progress?: ProgressReporter): Promise<DeSORecord> {
    if (!progress) {
      return this.scbAdapter.getDeSOById(cacheMode, desoId);
    }
    return progress.runStep(`Loading DeSO ${desoId}`, () => this.scbAdapter.getDeSOById(cacheMode, desoId));
  }
}
