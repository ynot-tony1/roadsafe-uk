const FILTER_ARRAY_FIELDS = new Set([
  "severity",
  "roadUserType",
  "vehicleType",
  "casualtyAgeBand",
  "driverAgeBand",
  "weather",
  "lightConditions",
  "roadSurface",
  "speedLimit",
  "urbanRural",
  "junctionDetail",
  "junctionControl",
  "roadType",
  "firstRoadClass",
  "secondRoadClass",
  "dayOfWeek",
  "month",
  "localAuthority",
  "policeForce",
  "specialConditions",
  "carriagewayHazard",
]);

/**
 * Builds the nested `filters` object MapFiltersSchema expects from flat query
 * params. Accepts both repeated keys (?severity=FATAL&severity=SERIOUS) and
 * comma-separated values (?severity=FATAL,SERIOUS).
 */
export function filtersFromSearchParams(searchParams: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const raw = searchParams.getAll(key);
    if (FILTER_ARRAY_FIELDS.has(key)) {
      out[key] = raw.flatMap((v) => v.split(",")).filter((v) => v.length > 0);
    } else {
      out[key] = raw[0];
    }
  }
  return out;
}

export function bboxFromSearchParams(searchParams: URLSearchParams): Record<string, unknown> {
  return {
    minLat: searchParams.get("minLat"),
    maxLat: searchParams.get("maxLat"),
    minLng: searchParams.get("minLng"),
    maxLng: searchParams.get("maxLng"),
  };
}
