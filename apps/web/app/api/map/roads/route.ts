import { Prisma, prisma } from "@roadsafe-uk/database";
import { MAP_QUERY_LIMITS, RoadsQuerySchema, resolveRoadClassesForZoom } from "@roadsafe-uk/shared";
import { NextResponse, type NextRequest } from "next/server";

import { bboxFromSearchParams } from "@/lib/api/query";
import { zodErrorResponse } from "@/lib/api/response";

interface RoadSegmentRow {
  id: string;
  name: string | null;
  road_class: string | null;
  safety_rating: string;
  collision_count: number;
  fatal_count: number;
  serious_count: number;
  slight_count: number;
  geojson: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const parsed = RoadsQuerySchema.safeParse({
    bbox: bboxFromSearchParams(searchParams),
    zoom: searchParams.get("zoom"),
  });

  if (!parsed.success) {
    return zodErrorResponse(parsed.error);
  }

  const { bbox, zoom } = parsed.data;
  const roadClasses = resolveRoadClassesForZoom(zoom);

  const rows = await prisma.$queryRaw<RoadSegmentRow[]>(Prisma.sql`
    SELECT
      id, name, road_class, safety_rating::STRING AS safety_rating,
      collision_count, fatal_count, serious_count, slight_count,
      ST_AsGeoJSON(geometry) AS geojson
    FROM road_segments
    WHERE road_class IN (${Prisma.join(roadClasses)})
      AND ST_Intersects(
        geometry,
        ST_MakeEnvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326)
      )
    LIMIT ${MAP_QUERY_LIMITS.MAX_ROAD_SEGMENTS}
  `);

  return NextResponse.json({
    roads: rows.map((row) => ({
      id: row.id,
      name: row.name,
      roadClass: row.road_class,
      safetyRating: row.safety_rating,
      collisionCount: row.collision_count,
      fatalCount: row.fatal_count,
      seriousCount: row.serious_count,
      slightCount: row.slight_count,
      geometry: JSON.parse(row.geojson) as { type: "LineString"; coordinates: [number, number][] },
    })),
  });
}
