import path from "node:path";
import os from "node:os";

export const APP_NAME = "scbdata";
export const APP_VERSION = "0.1.0";
export const DEFAULT_OUTPUT_FORMAT = "list";
export const DEFAULT_CACHE_MODE = "read";
export const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".cache", APP_NAME);

export const USER_AGENT = `${APP_NAME}/${APP_VERSION} (+https://github.com/andreas/scbdata-cli)`;

export const SCB_WFS_ENDPOINT = "https://geodata.scb.se/geoserver/stat/wfs";
export const SCB_DESO_LAYERS = ["stat:DeSO_2025", "stat:DeSO_2024", "stat:DeSO_2023"] as const;
export const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
export const VAL_RAW_DATA_PAGE =
  "https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-fran-val-2006-2022";

export const SWEREF99_TM = "EPSG:3006";
export const WGS84 = "EPSG:4326";

export const SUPPORTED_ELECTION_TYPES = ["riksdag", "kommun", "region"] as const;
