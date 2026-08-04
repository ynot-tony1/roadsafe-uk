import { describe, expect, it } from 'vitest';
import {
  BoundingBoxSchema,
  CollisionsQuerySchema,
  H3QuerySchema,
  MapFiltersSchema,
  YearRangeSchema,
} from './map-schemas';

describe('BoundingBoxSchema', () => {
  it('coerces query string values to numbers', () => {
    const result = BoundingBoxSchema.parse({
      minLat: '51.4',
      maxLat: '51.6',
      minLng: '-0.2',
      maxLng: '0.1',
    });
    expect(result).toEqual({ minLat: 51.4, maxLat: 51.6, minLng: -0.2, maxLng: 0.1 });
  });

  it('accepts a nationwide bbox at low zoom, wider than GB itself', () => {
    // A normal wide viewport centred on GB at low zoom always shows some
    // surrounding sea and other countries. This must not be rejected.
    const result = BoundingBoxSchema.parse({
      minLat: 51.13,
      maxLat: 57.61,
      minLng: -15.4,
      maxLng: 8.4,
    });
    expect(result.minLng).toBeCloseTo(-15.4);
    expect(result.maxLng).toBeCloseTo(8.4);
  });

  it('clamps wildly out of range coordinates instead of throwing', () => {
    const result = BoundingBoxSchema.parse({
      minLat: -90,
      maxLat: 90,
      minLng: -180,
      maxLng: 180,
    });
    expect(result.minLat).toBeGreaterThan(-90);
    expect(result.maxLat).toBeLessThan(90);
    expect(result.minLng).toBeGreaterThan(-180);
    expect(result.maxLng).toBeLessThan(180);
  });

  it('rejects a bbox where min is not less than max', () => {
    expect(() =>
      BoundingBoxSchema.parse({ minLat: 52, maxLat: 51, minLng: -1, maxLng: 0 }),
    ).toThrow();
  });
});

describe('YearRangeSchema', () => {
  it('accepts a valid ascending range', () => {
    expect(YearRangeSchema.parse({ fromYear: '2019', toYear: '2023' })).toEqual({
      fromYear: 2019,
      toYear: 2023,
    });
  });

  it('rejects a range where fromYear is after toYear', () => {
    expect(() => YearRangeSchema.parse({ fromYear: 2023, toYear: 2019 })).toThrow();
  });
});

describe('MapFiltersSchema', () => {
  it('defaults sourceStatus to FINAL when omitted', () => {
    const result = MapFiltersSchema.parse({});
    expect(result.sourceStatus).toBe('FINAL');
  });

  it('accepts a well formed filter set', () => {
    const result = MapFiltersSchema.parse({
      severity: ['FATAL', 'SERIOUS'],
      roadUserType: ['PEDESTRIAN'],
      fromYear: '2020',
    });
    expect(result.severity).toEqual(['FATAL', 'SERIOUS']);
    expect(result.fromYear).toBe(2020);
  });

  it('rejects an invalid severity value', () => {
    expect(() => MapFiltersSchema.parse({ severity: ['DEADLY'] })).toThrow();
  });
});

describe('H3QuerySchema', () => {
  it('parses a realistic national-view query', () => {
    const result = H3QuerySchema.parse({
      bbox: { minLat: '49.9', maxLat: '60.9', minLng: '-8', maxLng: '2' },
      zoom: '5.2',
      filters: {},
    });
    expect(result.zoom).toBeCloseTo(5.2);
  });
});

describe('CollisionsQuerySchema', () => {
  it('applies the default raw point limit when none is given', () => {
    const result = CollisionsQuerySchema.parse({
      bbox: { minLat: 51.4, maxLat: 51.5, minLng: -0.2, maxLng: -0.1 },
      filters: {},
    });
    expect(result.limit).toBeGreaterThan(0);
  });

  it('rejects a limit above the hard maximum', () => {
    expect(() =>
      CollisionsQuerySchema.parse({
        bbox: { minLat: 51.4, maxLat: 51.5, minLng: -0.2, maxLng: -0.1 },
        filters: {},
        limit: 999999,
      }),
    ).toThrow();
  });
});
