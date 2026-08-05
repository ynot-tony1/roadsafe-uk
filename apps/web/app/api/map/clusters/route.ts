import { Prisma, prisma } from "@roadsafe-uk/database";
import { ClusterQuerySchema, resolveZoomStrategy } from "@roadsafe-uk/shared";
import { cellToLatLng } from "h3-js";
import { NextResponse, type NextRequest } from "next/server";

import { bboxCondition, collisionFilterConditions, whereClause } from "@/lib/api/collision-filters";
import { bboxFromSearchParams, filtersFromSearchParams } from "@/lib/api/query";
import { jsonError, zodErrorResponse } from "@/lib/api/response";

const H3_COLUMN_BY_RESOLUTION = {
  5: Prisma.sql`c.h3_resolution_5`,
  7: Prisma.sql`c.h3_resolution_7`,
  9: Prisma.sql`c.h3_resolution_9`,
} as const;

interface ClusterAggregateRow {
  h3_index: string;
  // See app/api/map/h3/route.ts: CockroachDB's count(*) comes back as a
  // JS BigInt through Prisma's raw query path regardless of the ::int
  // cast in the SQL below.
  collision_count: bigint;
  fatal_count: bigint;
  serious_count: bigint;
  slight_count: bigint;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const parsed = ClusterQuerySchema.safeParse({
    bbox: bboxFromSearchParams(searchParams),
    zoom: searchParams.get("zoom"),
    filters: filtersFromSearchParams(searchParams),
  });

  if (!parsed.success) {
    return zodErrorResponse(parsed.error);
  }

  const { bbox, zoom, filters } = parsed.data;
  const strategy = resolveZoomStrategy(zoom);

  if (strategy.mode === "points" || !strategy.h3Resolution) {
    return jsonError(
      400,
      "This zoom level resolves to the raw points layer, use /api/map/collisions instead",
    );
  }

  const h3Column = H3_COLUMN_BY_RESOLUTION[strategy.h3Resolution];
  const conditions = [...collisionFilterConditions(filters), bboxCondition(bbox)];

  const rows = await prisma.$queryRaw<ClusterAggregateRow[]>(Prisma.sql`
    SELECT
      ${h3Column} AS h3_index,
      count(*)::int AS collision_count,
      count(*) FILTER (WHERE c.severity_code = 1)::int AS fatal_count,
      count(*) FILTER (WHERE c.severity_code = 2)::int AS serious_count,
      count(*) FILTER (WHERE c.severity_code = 3)::int AS slight_count
    FROM collisions c
    WHERE ${h3Column} IS NOT NULL AND ${whereClause(conditions)}
    GROUP BY ${h3Column}
  `);

  return NextResponse.json({
    mode: "CLUSTERS",
    h3Resolution: strategy.h3Resolution,
    clusters: rows.map((row) => {
      const [lat, lng] = cellToLatLng(row.h3_index);
      return {
        h3Index: row.h3_index,
        latitude: lat,
        longitude: lng,
        collisionCount: Number(row.collision_count),
        fatalCount: Number(row.fatal_count),
        seriousCount: Number(row.serious_count),
        slightCount: Number(row.slight_count),
      };
    }),
  });
}
