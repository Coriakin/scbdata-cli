import area from "@turf/area";
import intersect from "@turf/intersect";
import { featureCollection, point } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import proj4 from "proj4";
import { SWEREF99_TM, WGS84 } from "../config.js";

proj4.defs(
  SWEREF99_TM,
  "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs +axis=enu +towgs84=0,0,0"
);

export function toWgs84(x: number, y: number): [number, number] {
  return proj4(SWEREF99_TM, WGS84, [x, y]) as [number, number];
}

export function toSweref99Tm(lon: number, lat: number): [number, number] {
  return proj4(WGS84, SWEREF99_TM, [lon, lat]) as [number, number];
}

export function pointInFeature(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  lon: number,
  lat: number
): boolean {
  return booleanPointInPolygon(point([lon, lat]), feature);
}

export function overlapRatio(
  left: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  right: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
): number {
  const intersected = intersect(featureCollection([left, right]));
  if (!intersected) {
    return 0;
  }
  const rightArea = area(right);
  if (rightArea === 0) {
    return 0;
  }
  return area(intersected) / rightArea;
}
