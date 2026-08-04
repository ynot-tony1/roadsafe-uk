import type { MapBounds } from "@/lib/map/types";

export interface MapFiltersState {
  fromYear?: number;
  toYear?: number;
  severity?: string[];
  roadUserType?: string[];
}

export function filtersToSearchParams(
  filters: MapFiltersState,
  params: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  if (filters.fromYear !== undefined) params.set("fromYear", String(filters.fromYear));
  if (filters.toYear !== undefined) params.set("toYear", String(filters.toYear));
  for (const s of filters.severity ?? []) params.append("severity", s);
  for (const r of filters.roadUserType ?? []) params.append("roadUserType", r);
  return params;
}

export function boundsToSearchParams(
  bounds: MapBounds,
  params: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  params.set("minLat", String(bounds.minLat));
  params.set("maxLat", String(bounds.maxLat));
  params.set("minLng", String(bounds.minLng));
  params.set("maxLng", String(bounds.maxLng));
  return params;
}
