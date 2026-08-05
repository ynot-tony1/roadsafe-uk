import { Prisma, prisma } from "@roadsafe-uk/database";
import { H3QuerySchema, resolveZoomStrategy } from "@roadsafe-uk/shared";
import { NextResponse, type NextRequest } from "next/server";

import { bboxCondition, collisionFilterConditions, whereClause } from "@/lib/api/collision-filters";
import { bboxFromSearchParams, filtersFromSearchParams } from "@/lib/api/query";
import { jsonError, zodErrorResponse } from "@/lib/api/response";

const H3_COLUMN_BY_RESOLUTION = {
  5: Prisma.sql`c.h3_resolution_5`,
  7: Prisma.sql`c.h3_resolution_7`,
  9: Prisma.sql`c.h3_resolution_9`,
} as const;

interface H3AggregateRow {
  h3_index: string;
  // CockroachDB's count(*) comes back as a JS BigInt through Prisma's raw
  // query path regardless of an explicit ::int cast in the SQL, and
  // NextResponse.json (JSON.stringify) cannot serialize BigInt, so these
  // are converted with Number() below rather than trusted as already
  // being plain numbers.
  collision_count: bigint;
  fatal_count: bigint;
  serious_count: bigint;
  slight_count: bigint;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const parsed = H3QuerySchema.safeParse({
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

  const rows = await prisma.$queryRaw<H3AggregateRow[]>(Prisma.sql`
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
    mode: strategy.mode,
    h3Resolution: strategy.h3Resolution,
    cells: rows.map((row) => ({
      h3Index: row.h3_index,
      collisionCount: Number(row.collision_count),
      fatalCount: Number(row.fatal_count),
      seriousCount: Number(row.serious_count),
      slightCount: Number(row.slight_count),
    })),
  });
}
