import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { SEVERITY_COLORS } from "@roadsafe-uk/shared";

import { hexToRgb, withAlpha, type RgbColor } from "@/lib/map/colors";
import type { ClusterPoint, CollisionPoint, H3Cell } from "@/lib/map/types";

const MODE_ACCENT_COLOR: Record<string, RgbColor> = {
  PEDESTRIAN: [37, 99, 235],
  CYCLIST: [22, 163, 74],
  MOTORCYCLIST: [147, 51, 234],
  YOUNG_DRIVER: [8, 145, 178],
};

const FATAL_RGB = hexToRgb(SEVERITY_COLORS[1]);
const SERIOUS_RGB = hexToRgb(SEVERITY_COLORS[2]);
const SLIGHT_RGB = hexToRgb(SEVERITY_COLORS[3]);

function severityMixColor(cell: H3Cell): [number, number, number, number] {
  const total = cell.collisionCount || 1;
  const weights = [cell.fatalCount / total, cell.seriousCount / total, cell.slightCount / total];
  const channels = [0, 1, 2].map((i) =>
    Math.round(FATAL_RGB[i] * weights[0] + SERIOUS_RGB[i] * weights[1] + SLIGHT_RGB[i] * weights[2]),
  );
  return [channels[0], channels[1], channels[2], 200];
}

function intensityColor(count: number, maxCount: number, base: RgbColor): [number, number, number, number] {
  const t = maxCount > 0 ? Math.min(count / maxCount, 1) : 0;
  return withAlpha(base, 60 + t * 180);
}

export function buildH3Layer(
  mode: string,
  cells: H3Cell[],
  onHover: (cell: H3Cell | null) => void,
) {
  const maxCount = cells.reduce((max, c) => Math.max(max, c.collisionCount), 0);
  const accent = MODE_ACCENT_COLOR[mode];

  return new H3HexagonLayer<H3Cell>({
    id: "h3-cells",
    data: cells,
    getHexagon: (d) => d.h3Index,
    getFillColor: accent ? (d) => intensityColor(d.collisionCount, maxCount, accent) : (d) => severityMixColor(d),
    getLineColor: [255, 255, 255, 60],
    lineWidthMinPixels: 1,
    stroked: true,
    filled: true,
    pickable: true,
    onHover: (info) => onHover((info.object as H3Cell | undefined) ?? null),
  });
}

export function buildHeatmapLayer(points: ClusterPoint[]) {
  return new HeatmapLayer<ClusterPoint>({
    id: "heatmap",
    data: points,
    getPosition: (d) => [d.longitude, d.latitude],
    getWeight: (d) => d.collisionCount,
    radiusPixels: 40,
    intensity: 1,
    threshold: 0.03,
  });
}

export function buildClusterLayer(
  points: ClusterPoint[],
  onHover: (point: ClusterPoint | null) => void,
) {
  return new ScatterplotLayer<ClusterPoint>({
    id: "clusters",
    data: points,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: (d) => Math.sqrt(d.collisionCount) * 150,
    radiusMinPixels: 4,
    radiusMaxPixels: 60,
    getFillColor: [37, 99, 235, 170],
    stroked: true,
    getLineColor: [255, 255, 255, 200],
    lineWidthMinPixels: 1,
    pickable: true,
    onHover: (info) => onHover((info.object as ClusterPoint | undefined) ?? null),
  });
}

export function buildPointsLayer(
  points: CollisionPoint[],
  onClick: (collisionIndex: string) => void,
) {
  return new ScatterplotLayer<CollisionPoint>({
    id: "points",
    data: points,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: 35,
    radiusMinPixels: 3,
    radiusMaxPixels: 12,
    getFillColor: (d) => withAlpha(hexToRgb(SEVERITY_COLORS[d.severityCode as 1 | 2 | 3] ?? "#666666"), 220),
    stroked: true,
    getLineColor: [255, 255, 255, 200],
    lineWidthMinPixels: 1,
    pickable: true,
    onClick: (info) => info.object && onClick((info.object as CollisionPoint).collisionIndex),
  });
}
