import snapshot from "./geodata/astana.json";
import type { DistrictId } from "@/domain/types";
export type MapDistrictId = DistrictId | "sarayshyq";
export type Point2 = [number, number];
export type Rings = Point2[][];
export interface GeoDistrict {
  id: MapDistrictId;
  name: string;
  osmId: number;
  version: number;
  editedAt: string;
  areaKm2: number;
  polygons: Rings[];
  core: Rings[];
  center: Point2;
  fullCenter: Point2;
}
export interface GeoRoute {
  points: Point2[];
  wayIds: number[];
  stops: { osmId: number; at: number; point: Point2 }[];
  lengthKm: number;
  isPublicBusRoute: false;
}
export interface GeoSite {
  point: Point2;
  path: Point2[];
  parkId: number;
  pathId: number;
  name: string;
}
export interface Geography {
  retrievedAt: string;
  origin: Point2;
  coreBounds: [number, number, number, number];
  districts: GeoDistrict[];
  roads: {
    osmId: number;
    kind: string;
    bridge: boolean;
    name: string;
    points: Point2[];
  }[];
  buildings: {
    osmId: number;
    rings: Rings;
    height: number;
    heightKnown: boolean;
  }[];
  parks: { osmId: number; rings: Rings[] }[];
  water: Rings[];
  rivers: { osmId: number; name: string; points: Point2[] }[];
  routes: Record<DistrictId, GeoRoute>;
  sites: Record<DistrictId, GeoSite>;
  landmarks: { id: string; osmId: number; name: string; point: Point2 }[];
}
export const geography = snapshot as unknown as Geography;
export const districtName = (id: MapDistrictId) =>
  geography.districts.find((d) => d.id === id)!.name;

/** Piecewise linear sampling preserves the source road/path instead of cutting corners. */
export function pathSample(points: readonly Point2[], distance: number) {
  let total = 0;
  const lengths = points.slice(1).map((p, i) => {
    const n = Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]);
    total += n;
    return n;
  });
  let at = Math.max(0, Math.min(1, distance)) * total;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (at <= length || i === lengths.length - 1) {
      const a = points[i]!,
        b = points[i + 1]!,
        t = length ? at / length : 0;
      return {
        x: a[0] + (b[0] - a[0]) * t,
        z: a[1] + (b[1] - a[1]) * t,
        angle: Math.atan2(b[0] - a[0], b[1] - a[1]),
      };
    }
    at -= length;
  }
  return { x: points[0]![0], z: points[0]![1], angle: 0 };
}
