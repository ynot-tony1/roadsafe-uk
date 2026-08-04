/**
 * Zoom-dependent map query strategy (spec section 9).
 * Thresholds are provisional defaults; docs/map-architecture.md records the
 * tuning methodology and any measured adjustments made during testing.
 */
export const H3_RESOLUTION = {
  NATIONAL_REGIONAL: 5,
  CITY: 7,
  NEIGHBOURHOOD: 9,
} as const;

export type MapLayerMode = 'h3-5' | 'h3-7' | 'h3-9' | 'points';

export interface ZoomStrategyResult {
  mode: MapLayerMode;
  h3Resolution?: 5 | 7 | 9;
}

export function resolveZoomStrategy(zoom: number): ZoomStrategyResult {
  if (zoom <= 7) return { mode: 'h3-5', h3Resolution: H3_RESOLUTION.NATIONAL_REGIONAL };
  if (zoom <= 10) return { mode: 'h3-7', h3Resolution: H3_RESOLUTION.CITY };
  if (zoom <= 13) return { mode: 'h3-9', h3Resolution: H3_RESOLUTION.NEIGHBOURHOOD };
  return { mode: 'points' };
}

/** Hard limits enforced server-side for raw point queries (spec section 9/10). */
export const MAP_QUERY_LIMITS = {
  DEFAULT_RAW_POINT_LIMIT: 2000,
  MAX_RAW_POINT_LIMIT: 5000,
  DEFAULT_MAX_BOUNDING_BOX_AREA_DEG2: 0.05,
  MAX_YEAR_RANGE_FOR_POINTS: 5,
} as const;
