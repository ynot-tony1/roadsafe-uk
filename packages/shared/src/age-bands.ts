/**
 * STATS19 age_band_of_driver / age_band_of_casualty codes.
 * These bands are used throughout the public UI in preference to exact ages
 * (see docs/privacy.md). Configurable "vulnerable road user" groupings
 * (children, older road users, young drivers) are derived from these bands
 * rather than exact ages.
 */
export const AGE_BAND_CODES = {
  1: '0 to 5',
  2: '6 to 10',
  3: '11 to 15',
  4: '16 to 20',
  5: '21 to 25',
  6: '26 to 35',
  7: '36 to 45',
  8: '46 to 55',
  9: '56 to 65',
  10: '66 to 75',
  11: 'Over 75',
} as const;

export type AgeBandCode = keyof typeof AGE_BAND_CODES;

/** Age bands 1–3 (0–15 inclusive), used by the "children" road-user section. */
export const CHILD_AGE_BAND_CODES: AgeBandCode[] = [1, 2, 3];

/** Age bands 10–11 (66+), used by the "older road users" section. */
export const OLDER_ROAD_USER_AGE_BAND_CODES: AgeBandCode[] = [10, 11];

/**
 * Age bands 4–5 (16–25 inclusive) are used to flag "young driver involvement"
 * in filters. This threshold is configurable, see config/metric-definitions.yml.
 */
export const YOUNG_DRIVER_AGE_BAND_CODES: AgeBandCode[] = [4, 5];

export function ageBandLabel(code: number): string {
  return (AGE_BAND_CODES as Record<number, string>)[code] ?? 'Unknown';
}
