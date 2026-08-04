import { describe, expect, it } from 'vitest';
import {
  AGE_BAND_CODES,
  ageBandLabel,
  CHILD_AGE_BAND_CODES,
  OLDER_ROAD_USER_AGE_BAND_CODES,
  YOUNG_DRIVER_AGE_BAND_CODES,
} from './age-bands';

describe('age bands', () => {
  it('has a contiguous set of 11 bands', () => {
    expect(Object.keys(AGE_BAND_CODES)).toHaveLength(11);
  });

  it('returns the correct label for a known code', () => {
    expect(ageBandLabel(1)).toBe('0 to 5');
    expect(ageBandLabel(11)).toBe('Over 75');
  });

  it('returns "Unknown" for an unrecognised code', () => {
    expect(ageBandLabel(999)).toBe('Unknown');
  });

  it('keeps child, older road user and young driver groupings disjoint', () => {
    const child = new Set(CHILD_AGE_BAND_CODES);
    const older = new Set(OLDER_ROAD_USER_AGE_BAND_CODES);
    const young = new Set(YOUNG_DRIVER_AGE_BAND_CODES);
    for (const code of child) {
      expect(older.has(code)).toBe(false);
      expect(young.has(code)).toBe(false);
    }
    for (const code of young) {
      expect(older.has(code)).toBe(false);
    }
  });
});
