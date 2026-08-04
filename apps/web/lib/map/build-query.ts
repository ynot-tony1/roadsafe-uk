import { boundsToSearchParams, filtersToSearchParams, type MapFiltersState } from "@/lib/map/query-string";
import type { MapBounds } from "@/lib/map/types";

/**
 * Layer modes beyond the raw H3_HEXAGONS/CLUSTERS/INDIVIDUAL_COLLISIONS views
 * are just the shared filter builder pre-loaded with a fixed involvement
 * filter, so the same /api/map/* endpoints serve every mode.
 */
export function modeForcedParams(mode: string): URLSearchParams {
  const params = new URLSearchParams();
  switch (mode) {
    case "KSI_ONLY":
      params.append("severity", "FATAL");
      params.append("severity", "SERIOUS");
      break;
    case "PEDESTRIAN":
      params.append("roadUserType", "PEDESTRIAN");
      break;
    case "CYCLIST":
      params.append("roadUserType", "CYCLIST");
      break;
    case "MOTORCYCLIST":
      params.append("roadUserType", "MOTORCYCLIST");
      break;
    case "YOUNG_DRIVER":
      params.set("youngDriverInvolved", "true");
      break;
    default:
      break;
  }
  return params;
}

export function buildMapQueryParams(
  bounds: MapBounds,
  filters: MapFiltersState,
  mode: string,
): URLSearchParams {
  const params = boundsToSearchParams(bounds);
  filtersToSearchParams(filters, params);
  for (const [key, value] of modeForcedParams(mode)) {
    params.append(key, value);
  }
  return params;
}
