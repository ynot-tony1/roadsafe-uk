import {
  MAP_MODES,
  ROAD_SAFETY_RATINGS,
  ROAD_SAFETY_RATING_COLORS,
  ROAD_SAFETY_RATING_LABELS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  type MapMode,
} from "@roadsafe-uk/shared";
import { NextResponse, type NextRequest } from "next/server";

import { jsonError } from "@/lib/api/response";

interface LegendItem {
  code: string;
  label: string;
  color: string;
  description?: string;
}

const SEVERITY_LEGEND_ITEMS: LegendItem[] = [
  { code: "FATAL", label: SEVERITY_LABELS[1], color: SEVERITY_COLORS[1] },
  { code: "SERIOUS", label: SEVERITY_LABELS[2], color: SEVERITY_COLORS[2] },
  { code: "SLIGHT", label: SEVERITY_LABELS[3], color: SEVERITY_COLORS[3] },
];

const INTENSITY_LEGEND_ITEMS: LegendItem[] = [
  { code: "LOW", label: "Fewer collisions", color: "#fde68a" },
  { code: "HIGH", label: "More collisions", color: "#b91c1c" },
];

const LEGEND_BY_MODE: Record<MapMode, { title: string; items: LegendItem[] }> = {
  HEATMAP: { title: "Collision density", items: INTENSITY_LEGEND_ITEMS },
  H3_HEXAGONS: { title: "Collision severity", items: SEVERITY_LEGEND_ITEMS },
  CLUSTERS: { title: "Collision severity", items: SEVERITY_LEGEND_ITEMS },
  INDIVIDUAL_COLLISIONS: { title: "Collision severity", items: SEVERITY_LEGEND_ITEMS },
  KSI_ONLY: {
    title: "Killed or seriously injured",
    items: [
      { code: "FATAL", label: SEVERITY_LABELS[1], color: SEVERITY_COLORS[1] },
      { code: "SERIOUS", label: SEVERITY_LABELS[2], color: SEVERITY_COLORS[2] },
    ],
  },
  PEDESTRIAN: {
    title: "Pedestrian involvement",
    items: [{ code: "PEDESTRIAN", label: "Collision with a pedestrian casualty", color: "#2563eb" }],
  },
  CYCLIST: {
    title: "Cyclist involvement",
    items: [{ code: "CYCLIST", label: "Collision with a cyclist casualty", color: "#16a34a" }],
  },
  MOTORCYCLIST: {
    title: "Motorcyclist involvement",
    items: [
      { code: "MOTORCYCLIST", label: "Collision with a motorcyclist casualty", color: "#9333ea" },
    ],
  },
  YOUNG_DRIVER: {
    title: "Young driver involvement",
    items: [
      {
        code: "YOUNG_DRIVER",
        label: "Collision involving a driver aged 16 to 25",
        color: "#0891b2",
      },
    ],
  },
  ROAD_SAFETY: {
    title: "Road safety rating",
    items: ROAD_SAFETY_RATINGS.map((rating) => ({
      code: rating,
      label: ROAD_SAFETY_RATING_LABELS[rating],
      color: ROAD_SAFETY_RATING_COLORS[rating],
    })),
  },
};

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") ?? "H3_HEXAGONS";

  if (!(MAP_MODES as readonly string[]).includes(mode)) {
    return jsonError(400, `Unknown map mode "${mode}"`, { validModes: MAP_MODES });
  }

  return NextResponse.json(LEGEND_BY_MODE[mode as MapMode]);
}
