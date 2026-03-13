import type { AddressRecord, CacheMode } from "../types.js";
import { OverpassAdapter } from "../adapters/overpass.js";
import { DeSOService } from "./deso-service.js";

export class AddressService {
  constructor(
    private readonly desoService: DeSOService,
    private readonly overpassAdapter: OverpassAdapter
  ) {}

  async byDeSO(cacheMode: CacheMode, desoId: string): Promise<AddressRecord[]> {
    const deso = await this.desoService.byId(cacheMode, desoId);
    return this.overpassAdapter.getAddressesInDeSO(cacheMode, deso);
  }

  async byAddress(cacheMode: CacheMode, query: string): Promise<AddressRecord[]> {
    const deso = await this.desoService.fromAddress(cacheMode, query);
    return this.overpassAdapter.getAddressesInDeSO(cacheMode, deso);
  }

  async byCoordinates(cacheMode: CacheMode, lat: number, lon: number): Promise<AddressRecord[]> {
    const deso = await this.desoService.fromCoordinates(cacheMode, lat, lon);
    return this.overpassAdapter.getAddressesInDeSO(cacheMode, deso);
  }
}
