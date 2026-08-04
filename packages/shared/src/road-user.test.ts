import { describe, expect, it } from 'vitest';
import { CASUALTY_TYPE_GROUPS, roadUserGroupForCasualtyType } from './road-user';

describe('road user groups', () => {
  it('classifies a pedestrian casualty type code', () => {
    expect(roadUserGroupForCasualtyType(0)).toBe('PEDESTRIAN');
  });

  it('classifies a cyclist casualty type code', () => {
    expect(roadUserGroupForCasualtyType(1)).toBe('CYCLIST');
  });

  it('classifies every motorcyclist code as MOTORCYCLIST', () => {
    for (const code of CASUALTY_TYPE_GROUPS.MOTORCYCLIST) {
      expect(roadUserGroupForCasualtyType(code)).toBe('MOTORCYCLIST');
    }
  });

  it('falls back to OTHER for an unrecognised code', () => {
    expect(roadUserGroupForCasualtyType(-1)).toBe('OTHER');
  });

  it('has no code assigned to more than one group', () => {
    const seen = new Map<number, string>();
    for (const [group, codes] of Object.entries(CASUALTY_TYPE_GROUPS)) {
      for (const code of codes) {
        expect(seen.has(code)).toBe(false);
        seen.set(code, group);
      }
    }
  });
});
