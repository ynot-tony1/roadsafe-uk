import { describe, expect, it } from 'vitest';
import { MAP_QUERY_LIMITS, resolveZoomStrategy } from './h3-strategy';

describe('resolveZoomStrategy', () => {
  it('uses resolution 5 hexagons at national zoom', () => {
    expect(resolveZoomStrategy(0)).toEqual({ mode: 'h3-5', h3Resolution: 5 });
    expect(resolveZoomStrategy(7)).toEqual({ mode: 'h3-5', h3Resolution: 5 });
  });

  it('uses resolution 7 hexagons at city zoom', () => {
    expect(resolveZoomStrategy(8)).toEqual({ mode: 'h3-7', h3Resolution: 7 });
    expect(resolveZoomStrategy(10)).toEqual({ mode: 'h3-7', h3Resolution: 7 });
  });

  it('uses resolution 9 hexagons at neighbourhood zoom', () => {
    expect(resolveZoomStrategy(11)).toEqual({ mode: 'h3-9', h3Resolution: 9 });
    expect(resolveZoomStrategy(13)).toEqual({ mode: 'h3-9', h3Resolution: 9 });
  });

  it('falls back to raw points at street level zoom', () => {
    expect(resolveZoomStrategy(14)).toEqual({ mode: 'points' });
    expect(resolveZoomStrategy(22)).toEqual({ mode: 'points' });
  });

  it('has consistent, non-overlapping thresholds across the full zoom range', () => {
    for (let zoom = 0; zoom <= 22; zoom += 0.5) {
      const result = resolveZoomStrategy(zoom);
      expect(['h3-5', 'h3-7', 'h3-9', 'points']).toContain(result.mode);
    }
  });

  it('exposes sane query limit defaults', () => {
    expect(MAP_QUERY_LIMITS.DEFAULT_RAW_POINT_LIMIT).toBeLessThanOrEqual(
      MAP_QUERY_LIMITS.MAX_RAW_POINT_LIMIT,
    );
  });
});
