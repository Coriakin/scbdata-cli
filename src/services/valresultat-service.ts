import type { CacheMode, ElectionType, ValresultatRecord } from "../types.js";
import { ValmyndighetenAdapter } from "../adapters/valmyndigheten.js";
import { DeSOService } from "./deso-service.js";

export class ValresultatService {
  constructor(
    private readonly desoService: DeSOService,
    private readonly valmyndighetenAdapter: ValmyndighetenAdapter
  ) {}

  async byDeSO(
    cacheMode: CacheMode,
    desoId: string,
    electionType: ElectionType,
    year: number
  ): Promise<ValresultatRecord> {
    const deso = await this.desoService.byId(cacheMode, desoId);
    return this.valmyndighetenAdapter.getValresultatForDeSO(cacheMode, deso, electionType, year);
  }
}
