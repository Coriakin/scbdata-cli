import type { CacheMode, DeSORecord } from "../types.js";
import { NominatimAdapter } from "../adapters/nominatim.js";
import { ScbWfsAdapter } from "../adapters/scb.js";

export class DeSOService {
  constructor(
    private readonly scbAdapter: ScbWfsAdapter,
    private readonly nominatimAdapter: NominatimAdapter
  ) {}

  async fromCoordinates(cacheMode: CacheMode, lat: number, lon: number): Promise<DeSORecord> {
    return this.scbAdapter.resolveDeSOByCoordinates(cacheMode, { lat, lon });
  }

  async fromAddress(cacheMode: CacheMode, query: string): Promise<DeSORecord> {
    const geocode = await this.nominatimAdapter.geocode(cacheMode, query);
    return this.scbAdapter.resolveDeSOByCoordinates(cacheMode, geocode.coordinates);
  }

  async byId(cacheMode: CacheMode, desoId: string): Promise<DeSORecord> {
    return this.scbAdapter.getDeSOById(cacheMode, desoId);
  }
}
