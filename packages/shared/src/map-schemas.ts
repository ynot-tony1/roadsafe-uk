import { z } from 'zod';
import { MAP_QUERY_LIMITS } from './h3-strategy';
import { MAP_MODES } from './map-modes';

/**
 * A generous margin around Great Britain, wide enough that a normal low-zoom
 * viewport (which always shows some surrounding sea and other countries on a
 * typical screen aspect ratio) never gets rejected, while still catching
 * genuinely nonsense coordinates (e.g. a bbox on the other side of the
 * world).
 */
const CLAMP_BOUNDS = {
  minLat: 40,
  maxLat: 68,
  minLng: -25,
  maxLng: 15,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Validates the bbox is well formed and clamps it into a generous envelope
 * around Great Britain, rather than rejecting requests outright, a normal
 * wide viewport at low zoom will always show some area beyond GB's own
 * administrative bounds. Aggregate endpoints (h3, clusters) legitimately
 * need a nationwide bbox at low zoom, so any tighter area ceiling belongs to
 * the specific endpoint that needs one (the raw points route enforces
 * MAP_QUERY_LIMITS itself).
 */
export const BoundingBoxSchema = z
  .object({
    minLat: z.coerce.number().transform((v) => clamp(v, CLAMP_BOUNDS.minLat, CLAMP_BOUNDS.maxLat)),
    maxLat: z.coerce.number().transform((v) => clamp(v, CLAMP_BOUNDS.minLat, CLAMP_BOUNDS.maxLat)),
    minLng: z.coerce.number().transform((v) => clamp(v, CLAMP_BOUNDS.minLng, CLAMP_BOUNDS.maxLng)),
    maxLng: z.coerce.number().transform((v) => clamp(v, CLAMP_BOUNDS.minLng, CLAMP_BOUNDS.maxLng)),
  })
  .refine((b) => b.minLat < b.maxLat && b.minLng < b.maxLng, {
    message: 'Bounding box min must be less than max',
  });

export const YearRangeSchema = z
  .object({
    fromYear: z.coerce.number().int().min(1979).max(2100),
    toYear: z.coerce.number().int().min(1979).max(2100),
  })
  .refine((y) => y.fromYear <= y.toYear, { message: 'fromYear must be <= toYear' });

export const MapModeSchema = z.enum(MAP_MODES);

export const SourceStatusFilterSchema = z.enum(['FINAL', 'PROVISIONAL', 'ALL']).default('FINAL');

/** Shared filter payload accepted by every /api/map/* route. Kept in the URL by the client. */
export const MapFiltersSchema = z.object({
  fromYear: z.coerce.number().int().optional(),
  toYear: z.coerce.number().int().optional(),
  sourceStatus: SourceStatusFilterSchema,
  severity: z.array(z.enum(['FATAL', 'SERIOUS', 'SLIGHT'])).optional(),
  roadUserType: z.array(z.string()).optional(),
  vehicleType: z.array(z.coerce.number().int()).optional(),
  casualtyAgeBand: z.array(z.coerce.number().int()).optional(),
  driverAgeBand: z.array(z.coerce.number().int()).optional(),
  youngDriverInvolved: z.coerce.boolean().optional(),
  pedestrianInvolved: z.coerce.boolean().optional(),
  cyclistInvolved: z.coerce.boolean().optional(),
  motorcycleInvolved: z.coerce.boolean().optional(),
  weather: z.array(z.coerce.number().int()).optional(),
  lightConditions: z.array(z.coerce.number().int()).optional(),
  roadSurface: z.array(z.coerce.number().int()).optional(),
  speedLimit: z.array(z.coerce.number().int()).optional(),
  urbanRural: z.array(z.coerce.number().int()).optional(),
  junctionDetail: z.array(z.coerce.number().int()).optional(),
  junctionControl: z.array(z.coerce.number().int()).optional(),
  roadType: z.array(z.coerce.number().int()).optional(),
  firstRoadClass: z.array(z.coerce.number().int()).optional(),
  secondRoadClass: z.array(z.coerce.number().int()).optional(),
  dayOfWeek: z.array(z.coerce.number().int().min(1).max(7)).optional(),
  month: z.array(z.coerce.number().int().min(1).max(12)).optional(),
  hourFrom: z.coerce.number().int().min(0).max(23).optional(),
  hourTo: z.coerce.number().int().min(0).max(23).optional(),
  localAuthority: z.array(z.string()).optional(),
  policeForce: z.array(z.coerce.number().int()).optional(),
  specialConditions: z.array(z.coerce.number().int()).optional(),
  carriagewayHazard: z.array(z.coerce.number().int()).optional(),
});
export type MapFilters = z.infer<typeof MapFiltersSchema>;

export const H3QuerySchema = z.object({
  bbox: BoundingBoxSchema,
  zoom: z.coerce.number().min(0).max(22),
  filters: MapFiltersSchema.default({}),
});

export const ClusterQuerySchema = H3QuerySchema;

export const CollisionsQuerySchema = z.object({
  bbox: BoundingBoxSchema,
  filters: MapFiltersSchema.default({}),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAP_QUERY_LIMITS.MAX_RAW_POINT_LIMIT)
    .default(MAP_QUERY_LIMITS.DEFAULT_RAW_POINT_LIMIT),
  cursor: z.string().optional(),
});
