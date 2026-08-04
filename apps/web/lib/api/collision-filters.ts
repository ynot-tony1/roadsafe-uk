import { Prisma } from "@roadsafe-uk/database";
import {
  CASUALTY_TYPE_GROUPS,
  SEVERITY_CODES,
  YOUNG_DRIVER_AGE_BAND_CODES,
  type MapFilters,
  type RoadUserGroup,
} from "@roadsafe-uk/shared";

const SEVERITY_LABEL_TO_CODE: Record<string, number> = {
  FATAL: SEVERITY_CODES.FATAL,
  SERIOUS: SEVERITY_CODES.SERIOUS,
  SLIGHT: SEVERITY_CODES.SLIGHT,
};

function casualtyTypeExists(codes: readonly number[]): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM casualties cas
    WHERE cas.collision_index = c.collision_index
      AND cas.casualty_type_code IN (${Prisma.join([...codes])})
  )`;
}

/**
 * Builds the set of SQL conditions shared by every /api/map/* route that
 * queries the collisions table. Every raw-SQL data route composes its query
 * from this single source so filter semantics never drift between endpoints.
 */
export function collisionFilterConditions(filters: MapFilters): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  if (filters.fromYear !== undefined) {
    conditions.push(Prisma.sql`c.accident_year >= ${filters.fromYear}`);
  }
  if (filters.toYear !== undefined) {
    conditions.push(Prisma.sql`c.accident_year <= ${filters.toYear}`);
  }

  if (filters.sourceStatus !== "ALL") {
    conditions.push(Prisma.sql`c.source_status = ${filters.sourceStatus}::"SourceStatus"`);
  }

  if (filters.severity?.length) {
    const codes = filters.severity.map((s) => SEVERITY_LABEL_TO_CODE[s]);
    conditions.push(Prisma.sql`c.severity_code IN (${Prisma.join(codes)})`);
  }

  if (filters.speedLimit?.length) {
    conditions.push(Prisma.sql`c.speed_limit IN (${Prisma.join(filters.speedLimit)})`);
  }
  if (filters.urbanRural?.length) {
    conditions.push(Prisma.sql`c.urban_rural_code IN (${Prisma.join(filters.urbanRural)})`);
  }
  if (filters.junctionDetail?.length) {
    conditions.push(Prisma.sql`c.junction_detail_code IN (${Prisma.join(filters.junctionDetail)})`);
  }
  if (filters.junctionControl?.length) {
    conditions.push(Prisma.sql`c.junction_control_code IN (${Prisma.join(filters.junctionControl)})`);
  }
  if (filters.roadType?.length) {
    conditions.push(Prisma.sql`c.road_type_code IN (${Prisma.join(filters.roadType)})`);
  }
  if (filters.firstRoadClass?.length) {
    conditions.push(Prisma.sql`c.first_road_class_code IN (${Prisma.join(filters.firstRoadClass)})`);
  }
  if (filters.secondRoadClass?.length) {
    conditions.push(Prisma.sql`c.second_road_class_code IN (${Prisma.join(filters.secondRoadClass)})`);
  }
  if (filters.weather?.length) {
    conditions.push(Prisma.sql`c.weather_conditions_code IN (${Prisma.join(filters.weather)})`);
  }
  if (filters.lightConditions?.length) {
    conditions.push(Prisma.sql`c.light_conditions_code IN (${Prisma.join(filters.lightConditions)})`);
  }
  if (filters.roadSurface?.length) {
    conditions.push(
      Prisma.sql`c.road_surface_conditions_code IN (${Prisma.join(filters.roadSurface)})`,
    );
  }
  if (filters.dayOfWeek?.length) {
    conditions.push(Prisma.sql`c.day_of_week_code IN (${Prisma.join(filters.dayOfWeek)})`);
  }
  if (filters.month?.length) {
    conditions.push(Prisma.sql`EXTRACT(MONTH FROM c.date) IN (${Prisma.join(filters.month)})`);
  }
  if (filters.localAuthority?.length) {
    conditions.push(
      Prisma.sql`c.local_authority_district_code IN (${Prisma.join(filters.localAuthority)})`,
    );
  }
  if (filters.policeForce?.length) {
    conditions.push(Prisma.sql`c.police_force_code IN (${Prisma.join(filters.policeForce)})`);
  }
  if (filters.specialConditions?.length) {
    conditions.push(
      Prisma.sql`c.special_conditions_at_site_code IN (${Prisma.join(filters.specialConditions)})`,
    );
  }
  if (filters.carriagewayHazard?.length) {
    conditions.push(
      Prisma.sql`c.carriageway_hazards_code IN (${Prisma.join(filters.carriagewayHazard)})`,
    );
  }

  if (filters.hourFrom !== undefined) {
    conditions.push(
      Prisma.sql`c.time IS NOT NULL AND CAST(SPLIT_PART(c.time, ':', 1) AS INT) >= ${filters.hourFrom}`,
    );
  }
  if (filters.hourTo !== undefined) {
    conditions.push(
      Prisma.sql`c.time IS NOT NULL AND CAST(SPLIT_PART(c.time, ':', 1) AS INT) <= ${filters.hourTo}`,
    );
  }

  if (filters.pedestrianInvolved) {
    conditions.push(casualtyTypeExists(CASUALTY_TYPE_GROUPS.PEDESTRIAN));
  }
  if (filters.cyclistInvolved) {
    conditions.push(casualtyTypeExists(CASUALTY_TYPE_GROUPS.CYCLIST));
  }
  if (filters.motorcycleInvolved) {
    conditions.push(casualtyTypeExists(CASUALTY_TYPE_GROUPS.MOTORCYCLIST));
  }
  if (filters.roadUserType?.length) {
    const codes = filters.roadUserType.flatMap(
      (group) => CASUALTY_TYPE_GROUPS[group as RoadUserGroup] ?? [],
    );
    if (codes.length > 0) {
      conditions.push(casualtyTypeExists(codes));
    }
  }
  if (filters.casualtyAgeBand?.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM casualties cas
      WHERE cas.collision_index = c.collision_index
        AND cas.age_band_of_casualty_code IN (${Prisma.join(filters.casualtyAgeBand)})
    )`);
  }
  if (filters.driverAgeBand?.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM vehicles v
      WHERE v.collision_index = c.collision_index
        AND v.age_band_of_driver_code IN (${Prisma.join(filters.driverAgeBand)})
    )`);
  }
  if (filters.youngDriverInvolved) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM vehicles v
      WHERE v.collision_index = c.collision_index
        AND v.age_band_of_driver_code IN (${Prisma.join([...YOUNG_DRIVER_AGE_BAND_CODES])})
    )`);
  }

  return conditions;
}

export function bboxCondition(bbox: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): Prisma.Sql {
  return Prisma.sql`c.latitude BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
    AND c.longitude BETWEEN ${bbox.minLng} AND ${bbox.maxLng}`;
}

export function whereClause(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return Prisma.join(conditions, " AND ");
}
