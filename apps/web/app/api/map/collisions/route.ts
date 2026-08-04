import { Prisma, prisma } from "@roadsafe-uk/database";
import { CollisionsQuerySchema, MAP_QUERY_LIMITS } from "@roadsafe-uk/shared";
import { NextResponse, type NextRequest } from "next/server";

import { bboxCondition, collisionFilterConditions, whereClause } from "@/lib/api/collision-filters";
import { bboxFromSearchParams, filtersFromSearchParams } from "@/lib/api/query";
import { jsonError, zodErrorResponse } from "@/lib/api/response";

interface CollisionPointRow {
  collision_index: string;
  latitude: number;
  longitude: number;
  severity_code: number;
  accident_year: number;
  date: Date;
  local_authority_district_code: string;
  number_of_vehicles: number;
  number_of_casualties: number;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const parsed = CollisionsQuerySchema.safeParse({
    bbox: bboxFromSearchParams(searchParams),
    filters: filtersFromSearchParams(searchParams),
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });

  if (!parsed.success) {
    return zodErrorResponse(parsed.error);
  }

  const { bbox, filters, limit, cursor } = parsed.data;

  const bboxAreaDeg2 = (bbox.maxLat - bbox.minLat) * (bbox.maxLng - bbox.minLng);
  if (bboxAreaDeg2 > MAP_QUERY_LIMITS.DEFAULT_MAX_BOUNDING_BOX_AREA_DEG2) {
    return jsonError(
      400,
      `Bounding box too large for individual collision points, narrow the view to at most ${MAP_QUERY_LIMITS.DEFAULT_MAX_BOUNDING_BOX_AREA_DEG2} square degrees`,
    );
  }

  if (
    filters.fromYear !== undefined &&
    filters.toYear !== undefined &&
    filters.toYear - filters.fromYear > MAP_QUERY_LIMITS.MAX_YEAR_RANGE_FOR_POINTS
  ) {
    return jsonError(
      400,
      `Year range too wide for individual collision points, narrow it to at most ${MAP_QUERY_LIMITS.MAX_YEAR_RANGE_FOR_POINTS} years`,
    );
  }

  const conditions = [
    ...collisionFilterConditions(filters),
    bboxCondition(bbox),
    Prisma.sql`c.latitude IS NOT NULL AND c.longitude IS NOT NULL`,
  ];
  if (cursor) {
    conditions.push(Prisma.sql`c.collision_index > ${cursor}`);
  }

  const rows = await prisma.$queryRaw<CollisionPointRow[]>(Prisma.sql`
    SELECT
      c.collision_index, c.latitude, c.longitude, c.severity_code, c.accident_year,
      c.date, c.local_authority_district_code, c.number_of_vehicles, c.number_of_casualties
    FROM collisions c
    WHERE ${whereClause(conditions)}
    ORDER BY c.collision_index
    LIMIT ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    collisions: page.map((row) => ({
      collisionIndex: row.collision_index,
      latitude: row.latitude,
      longitude: row.longitude,
      severityCode: row.severity_code,
      accidentYear: row.accident_year,
      date: row.date,
      localAuthorityDistrictCode: row.local_authority_district_code,
      numberOfVehicles: row.number_of_vehicles,
      numberOfCasualties: row.number_of_casualties,
    })),
    nextCursor: hasMore ? page[page.length - 1].collision_index : null,
  });
}
