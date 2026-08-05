/**
 * Per-road safety ratings, derived from collisions snapped to OSM road
 * geometry (services/ingestor/src/roadsafe_ingestor/road_snapping.py).
 * NEUTRAL means no STATS19 collision has been matched to that road in the
 * imported window, not that the road is verified safe.
 */
export const ROAD_SAFETY_RATINGS = ['NEUTRAL', 'AMBER', 'DARK_AMBER', 'RED'] as const;
export type RoadSafetyRating = (typeof ROAD_SAFETY_RATINGS)[number];

export const ROAD_SAFETY_RATING_LABELS: Record<RoadSafetyRating, string> = {
  NEUTRAL: 'No recorded collisions',
  AMBER: 'Some collisions, low severity',
  DARK_AMBER: 'More collisions or a serious injury',
  RED: 'A fatal collision, or many collisions',
};

/** Colourblind-safe, kept visually consistent with SEVERITY_COLORS: RED here
 * is the same red as a fatal collision elsewhere in this app. */
export const ROAD_SAFETY_RATING_COLORS: Record<RoadSafetyRating, string> = {
  NEUTRAL: '#9ca3af',
  AMBER: '#fbbf24',
  DARK_AMBER: '#b45309',
  RED: '#b91c1c',
};

/** OSM `highway` classes included per zoom level, coarsest roads first, so a
 * national-zoom view isn't flooded with every residential street and service
 * road in the country. Mirrors resolveZoomStrategy's own zoom bands. */
export function resolveRoadClassesForZoom(zoom: number): string[] {
  const major = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'];
  if (zoom <= 7) return major;
  const midTier = [...major, 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'];
  if (zoom <= 10) return midTier;
  const local = [...midTier, 'unclassified', 'residential', 'living_street'];
  if (zoom <= 13) return local;
  return [...local, 'service', 'track', 'road'];
}
