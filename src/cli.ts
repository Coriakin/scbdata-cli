import { Command } from "commander";
import { CacheStore } from "./cache.js";
import { HttpClient } from "./http.js";
import { APP_NAME, APP_VERSION, DEFAULT_CACHE_MODE, DEFAULT_OUTPUT_FORMAT } from "./config.js";
import { NominatimAdapter } from "./adapters/nominatim.js";
import { OverpassAdapter } from "./adapters/overpass.js";
import { ScbWfsAdapter } from "./adapters/scb.js";
import { ValmyndighetenAdapter } from "./adapters/valmyndigheten.js";
import { AddressService } from "./services/address-service.js";
import { DeSOService } from "./services/deso-service.js";
import { ValresultatService } from "./services/valresultat-service.js";
import { writeOutput } from "./output.js";
import { StderrDebugLogger } from "./debug.js";
import { NoopProgressReporter, TerminalProgressReporter } from "./progress.js";
import { ScbDataError } from "./errors.js";
import {
  parseLatitude,
  parseLongitude,
  validateCacheMode,
  validateDeSOId,
  validateElectionType,
  validateElectionYear,
  validateOutputFormat
} from "./utils/validation.js";
import type { CommandOptions } from "./types.js";

function addCommonOptions(command: Command): Command {
  return command
    .option("--format <format>", "output format: list, json, csv", DEFAULT_OUTPUT_FORMAT)
    .option("--cache <mode>", "cache mode: read, refresh, bypass", DEFAULT_CACHE_MODE)
    .option("--output <path>", "write output to a file")
    .option("--debug", "write diagnostic details to stderr");
}

function addDesoOptions(command: Command): Command {
  return addCommonOptions(command).option("--include-geometry", "include full DeSO geometry in the output");
}

function resolveOptions(command: Command): CommandOptions {
  const options = command.opts();
  return {
    format: validateOutputFormat(options.format),
    cache: validateCacheMode(options.cache),
    output: options.output,
    includeGeometry: Boolean(options.includeGeometry),
    debug: Boolean(options.debug)
  };
}

function actionCommand(args: unknown[]): Command {
  return args[args.length - 1] as Command;
}

function createProgressReporter(command: Command) {
  const opts = command.opts();
  if (opts.output) {
    return new NoopProgressReporter();
  }
  return new TerminalProgressReporter();
}

function formatHelpBlock(lines: string[]): string {
  return `\n${lines.join("\n")}\n`;
}

function addRootHelp(command: Command): void {
  command.addHelpText(
    "after",
    formatHelpBlock([
      "Command details:",
      "  deso from-coords <lat> <lon>         Resolve DeSO from coordinates",
      "  deso from-address <query>            Resolve DeSO from a free-form address",
      "  addresses <desoId>                   Fetch all addresses in a DeSO",
      "  addresses from-address <query>       Resolve address to DeSO and fetch all addresses",
      "  addresses from-coords <lat> <lon>    Resolve coordinates to DeSO and fetch all addresses",
      "  valresultat <desoId> --election <type> --year <year>",
      "                                       Fetch aggregated election results for a DeSO using required election/year inputs"
    ])
  );
}

function addDesoHelp(command: Command): void {
  command.addHelpText(
    "after",
    formatHelpBlock([
      "Shared options for deso subcommands:",
      `  --format <format>                    output format: list, json, csv (default: "${DEFAULT_OUTPUT_FORMAT}")`,
      `  --cache <mode>                       cache mode: read, refresh, bypass (default: "${DEFAULT_CACHE_MODE}")`,
      "  --output <path>                      write output to a file",
      "  --debug                              write diagnostic details to stderr",
      "  --include-geometry                   include full DeSO geometry in the output"
    ])
  );
}

function addValresultatHelp(command: Command): void {
  command.addHelpText(
    "after",
    formatHelpBlock([
      "Example:",
      "  scbdata valresultat 0180C1234567 --election riksdag --year 2022",
      "",
      "Required inputs:",
      "  --election <type>                    election type for the aggregation lookup",
      "  --year <year>                        election year for the aggregation lookup"
    ])
  );
}

export function buildProgram(argv = process.argv): Command {
  const debugLogger = new StderrDebugLogger(argv.includes("--debug"));

  const cacheStore = new CacheStore();
  const httpClient = new HttpClient();

  const scbAdapter = new ScbWfsAdapter(httpClient, cacheStore);
  const nominatimAdapter = new NominatimAdapter(httpClient, cacheStore);
  const overpassAdapter = new OverpassAdapter(httpClient, cacheStore);
  const valmyndighetenAdapter = new ValmyndighetenAdapter(httpClient, cacheStore, debugLogger);

  const desoService = new DeSOService(scbAdapter, nominatimAdapter);
  const addressService = new AddressService(desoService, overpassAdapter);
  const valresultatService = new ValresultatService(desoService, valmyndighetenAdapter);

  const program = new Command();
  program.name(APP_NAME).description("DeSO and election data lookup CLI").version(APP_VERSION);
  addRootHelp(program);

  const deso = program.command("deso").description("Resolve DeSO areas");
  addDesoHelp(deso);
  addDesoOptions(
    deso
      .command("from-coords")
      .description("Resolve DeSO from coordinates")
      .argument("<lat>")
      .argument("<lon>")
      .action(async (...args: unknown[]) => {
        const [latValue, lonValue] = args as [string, string];
        const command = actionCommand(args);
        const options = resolveOptions(command);
        const progress = createProgressReporter(command);
        const result = await desoService.fromCoordinates(
          options.cache,
          parseLatitude(latValue),
          parseLongitude(lonValue),
          progress
        );
        progress.complete("DeSO resolved");
        await writeOutput(formatDeSOResult(result, options.includeGeometry), options.format, options.output);
      })
  );

  addDesoOptions(
    deso
      .command("from-address")
      .description("Resolve DeSO from a free-form address")
      .argument("<query>")
      .action(async (...args: unknown[]) => {
        const [query] = args as [string];
        const command = actionCommand(args);
        const options = resolveOptions(command);
        const progress = createProgressReporter(command);
        const result = await desoService.fromAddress(options.cache, query, progress);
        progress.complete("DeSO resolved");
        await writeOutput(formatDeSOResult(result, options.includeGeometry), options.format, options.output);
      })
  );

  const addresses = addCommonOptions(
    program.command("addresses").description("Fetch addresses in a DeSO").argument("[desoId]")
  ).action(async (...args: unknown[]) => {
      const [desoId] = args as [string | undefined];
      const command = actionCommand(args);
      if (!desoId) {
        command.help();
      }
      const options = resolveOptions(command);
      const progress = createProgressReporter(command);
      const result = await addressService.byDeSO(options.cache, validateDeSOId(desoId!), progress);
      progress.complete(`Fetched ${result.length} addresses`);
      await writeOutput(result, options.format, options.output);
    });

  addCommonOptions(
    addresses
      .command("from-address")
      .description("Resolve address to DeSO and fetch all addresses")
      .argument("<query>")
      .action(async (...args: unknown[]) => {
        const [query] = args as [string];
        const command = actionCommand(args);
        const options = resolveOptions(command);
        const progress = createProgressReporter(command);
        const result = await addressService.byAddress(options.cache, query, progress);
        progress.complete(`Fetched ${result.length} addresses`);
        await writeOutput(result, options.format, options.output);
      })
  );

  addCommonOptions(
    addresses
      .command("from-coords")
      .description("Resolve coordinates to DeSO and fetch all addresses")
      .argument("<lat>")
      .argument("<lon>")
      .action(async (...args: unknown[]) => {
        const [latValue, lonValue] = args as [string, string];
        const command = actionCommand(args);
        const options = resolveOptions(command);
        const progress = createProgressReporter(command);
        const result = await addressService.byCoordinates(
          options.cache,
          parseLatitude(latValue),
          parseLongitude(lonValue),
          progress
        );
        progress.complete(`Fetched ${result.length} addresses`);
        await writeOutput(result, options.format, options.output);
      })
  );

  addCommonOptions(
    addresses
      .command("list")
      .description("Fetch all addresses in a DeSO")
      .argument("<desoId>")
      .action(async (...args: unknown[]) => {
        const [desoId] = args as [string];
        const command = actionCommand(args);
        const options = resolveOptions(command);
        const progress = createProgressReporter(command);
        const result = await addressService.byDeSO(options.cache, validateDeSOId(desoId), progress);
        progress.complete(`Fetched ${result.length} addresses`);
        await writeOutput(result, options.format, options.output);
      })
  );

  const valresultat = addCommonOptions(
    program
      .command("valresultat")
      .description("Fetch aggregated election results for a DeSO")
      .argument("<desoId>")
      .requiredOption("--election <type>", "election type")
      .requiredOption("--year <year>", "election year")
      .action(async (...args: unknown[]) => {
        const [desoId] = args as [string];
        const command = actionCommand(args);
        const options = resolveOptions(command);
        const raw = command.opts();
        const progress = createProgressReporter(command);
        const result = await valresultatService.byDeSO(
          options.cache,
          validateDeSOId(desoId),
          validateElectionType(raw.election),
          validateElectionYear(raw.year),
          progress
        );
        progress.complete("Election results aggregated");
        await writeOutput(result, options.format, options.output);
      })
  );
  addValresultatHelp(valresultat);

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = buildProgram(argv);

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof ScbDataError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function formatDeSOResult(
  result: Awaited<ReturnType<DeSOService["fromAddress"]>>,
  includeGeometry = false
) {
  if (includeGeometry) {
    return result;
  }

  const { geometry: _geometry, ...rest } = result;
  return rest;
}
