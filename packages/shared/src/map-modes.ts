/** /map layer modes (spec section 7.2). */
export const MAP_MODES = [
  'HEATMAP',
  'H3_HEXAGONS',
  'CLUSTERS',
  'INDIVIDUAL_COLLISIONS',
  'KSI_ONLY',
  'PEDESTRIAN',
  'CYCLIST',
  'MOTORCYCLIST',
  'YOUNG_DRIVER',
  'ROAD_SAFETY',
] as const;

export type MapMode = (typeof MAP_MODES)[number];
