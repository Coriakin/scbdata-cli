import type { CacheMode, ElectionType, ValresultatRecord } from "../types.js";
import { ValmyndighetenAdapter } from "../adapters/valmyndigheten.js";
import type { ProgressReporter } from "../progress.js";
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
    year: number,
    progress?: ProgressReporter
  ): Promise<ValresultatRecord> {
    const deso = await this.desoService.byId(cacheMode, desoId, progress);
    if (!progress) {
      return this.valmyndighetenAdapter.getValresultatForDeSO(cacheMode, deso, electionType, year);
    }
    return progress.runStep(`Fetching election results for ${deso.desoId}`, () =>
      this.valmyndighetenAdapter.getValresultatForDeSO(cacheMode, deso, electionType, year)
    );
  }
}
