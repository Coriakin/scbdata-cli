import type { AddressRecord, CacheMode } from "../types.js";
import { OverpassAdapter } from "../adapters/overpass.js";
import type { ProgressReporter } from "../progress.js";
import { DeSOService } from "./deso-service.js";

export class AddressService {
  constructor(
    private readonly desoService: DeSOService,
    private readonly overpassAdapter: OverpassAdapter
  ) {}

  async byDeSO(cacheMode: CacheMode, desoId: string, progress?: ProgressReporter): Promise<AddressRecord[]> {
    const deso = await this.desoService.byId(cacheMode, desoId, progress);
    if (!progress) {
      return this.overpassAdapter.getAddressesInDeSO(cacheMode, deso);
    }
    return progress.runStep(`Fetching addresses for ${deso.desoId} from Overpass`, () =>
      this.overpassAdapter.getAddressesInDeSO(cacheMode, deso)
    );
  }

  async byAddress(cacheMode: CacheMode, query: string, progress?: ProgressReporter): Promise<AddressRecord[]> {
    const deso = await this.desoService.fromAddress(cacheMode, query, progress);
    if (!progress) {
      return this.overpassAdapter.getAddressesInDeSO(cacheMode, deso);
    }
    return progress.runStep(`Fetching addresses for ${deso.desoId} from Overpass`, () =>
      this.overpassAdapter.getAddressesInDeSO(cacheMode, deso)
    );
  }

  async byCoordinates(
    cacheMode: CacheMode,
    lat: number,
    lon: number,
    progress?: ProgressReporter
  ): Promise<AddressRecord[]> {
    const deso = await this.desoService.fromCoordinates(cacheMode, lat, lon, progress);
    if (!progress) {
      return this.overpassAdapter.getAddressesInDeSO(cacheMode, deso);
    }
    return progress.runStep(`Fetching addresses for ${deso.desoId} from Overpass`, () =>
      this.overpassAdapter.getAddressesInDeSO(cacheMode, deso)
    );
  }
}
