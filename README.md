# scbdata

`scbdata` is a TypeScript CLI for Swedish `DeSO` lookups, address extraction, and election result aggregation.

## Commands

```bash
scbdata deso from-coords 59.3293 18.0686
scbdata deso from-address "Drottninggatan 1, Stockholm"
scbdata addresses 0180C1234567
scbdata addresses from-address "Drottninggatan 1, Stockholm"
scbdata addresses from-coords 59.3293 18.0686
scbdata valresultat 0180C1234567 --election riksdag --year 2022
```

Shared flags:

- `--format list|json|csv`
- `--cache read|refresh|bypass`
- `--output <path>`

`deso` commands also support:

- `--include-geometry` to include the full GeoJSON geometry in the output

When running interactively, progress/status updates are written to `stderr` so `stdout` stays clean for piping and file output.

## Run from source

If you have this repository locally and have not installed `scbdata` via Homebrew or another package manager:

```bash
npm install
npm run build
node dist/index.js --help
```

You can then run commands directly with Node:

```bash
node dist/index.js deso from-address "Drottninggatan 1, Stockholm"
node dist/index.js deso from-address "Drottninggatan 1, Stockholm" --include-geometry --format json
node dist/index.js addresses 0180C1234567
node dist/index.js valresultat 0180C1234567 --election riksdag --year 2022
```

For development without building first:

```bash
npm install
npm run dev -- deso from-address "Drottninggatan 1, Stockholm"
```

## CI and releases

GitHub Actions is configured for:

- CI on push and pull request with Node 22
- release builds on tags like `v0.1.0`
- release artifacts for `linux-x64`, `linux-arm64`, and `darwin-arm64`
- a generated Homebrew formula artifact for use in a tap

The release bundles currently package the compiled CLI plus production `node_modules`, and the installed `scbdata` launcher uses the system `node`. A Homebrew formula can therefore depend on `node` rather than installing a fully static binary.

## Data sources

- SCB WFS for `DeSO` geometry and point lookup
- OpenStreetMap Nominatim for geocoding
- OpenStreetMap Overpass for address extraction
- Valmyndigheten raw data for election results

Address completeness depends on the upstream OpenStreetMap data. Some address records may be missing fields such as postcode even when street, house number, and city are present, because `addr:postcode` is not always tagged on each individual address object.

## Election mapping

Election results are aggregated to `DeSO` by intersecting official precinct (`valdistrikt`) geometries with the target `DeSO` polygon and weighting votes by overlap share. This is an approximation whenever election data is not published directly on the `DeSO` geography.
