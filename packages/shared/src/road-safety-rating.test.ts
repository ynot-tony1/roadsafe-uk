import { describe, expect, it } from 'vitest';
import {
  ROAD_SAFETY_RATINGS,
  ROAD_SAFETY_RATING_COLORS,
  ROAD_SAFETY_RATING_LABELS,
  resolveRoadClassesForZoom,
} from './road-safety-rating';

describe('road safety rating', () => {
  it('has a label and a colour for every rating', () => {
    for (const rating of ROAD_SAFETY_RATINGS) {
      expect(ROAD_SAFETY_RATING_LABELS[rating]).toBeTruthy();
      expect(ROAD_SAFETY_RATING_COLORS[rating]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('resolveRoadClassesForZoom', () => {
  it('shows only major roads at national zoom', () => {
    const classes = resolveRoadClassesForZoom(5);
    expect(classes).toContain('motorway');
    expect(classes).toContain('primary');
    expect(classes).not.toContain('residential');
    expect(classes).not.toContain('service');
  });

  it('adds secondary and tertiary roads at city zoom', () => {
    const classes = resolveRoadClassesForZoom(9);
    expect(classes).toContain('secondary');
    expect(classes).toContain('tertiary');
    expect(classes).not.toContain('residential');
  });

  it('adds residential roads at neighbourhood zoom', () => {
    const classes = resolveRoadClassesForZoom(12);
    expect(classes).toContain('residential');
    expect(classes).not.toContain('service');
  });

  it('shows every road class at street level', () => {
    const classes = resolveRoadClassesForZoom(16);
    expect(classes).toContain('service');
    expect(classes).toContain('track');
  });

  it('is monotonically increasing in scope as zoom increases', () => {
    const zooms = [0, 5, 7, 8, 10, 11, 13, 14, 18];
    let previous: string[] = [];
    for (const zoom of zooms) {
      const classes = resolveRoadClassesForZoom(zoom);
      for (const c of previous) {
        expect(classes).toContain(c);
      }
      previous = classes;
    }
  });
});
