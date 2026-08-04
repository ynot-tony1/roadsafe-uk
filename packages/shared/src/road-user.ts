/**
 * STATS19 casualty_type groupings used to classify vulnerable road users.
 * Full code -> label mapping is loaded into CodeDefinition from
 * config/stats19-code-lists; this file only encodes the *groupings* the
 * application's filters and road-user explorer need to reason about.
 */
export const CASUALTY_TYPE_GROUPS = {
  PEDESTRIAN: [0],
  CYCLIST: [1],
  MOTORCYCLIST: [2, 3, 4, 5, 23, 97, 103, 104, 105, 106],
  CAR_OCCUPANT: [8, 9, 108, 109],
  BUS_OR_COACH_OCCUPANT: [11, 110],
  GOODS_VEHICLE_OCCUPANT: [19, 20, 21, 98, 113, 119],
  OTHER: [10, 16, 17, 18, 22, 90, 99],
} as const;

export type RoadUserGroup = keyof typeof CASUALTY_TYPE_GROUPS;

export function roadUserGroupForCasualtyType(casualtyTypeCode: number): RoadUserGroup {
  for (const [group, codes] of Object.entries(CASUALTY_TYPE_GROUPS)) {
    if ((codes as readonly number[]).includes(casualtyTypeCode)) {
      return group as RoadUserGroup;
    }
  }
  return 'OTHER';
}

/** STATS19 casualty_class codes. */
export const CASUALTY_CLASS_CODES = {
  DRIVER_OR_RIDER: 1,
  PASSENGER: 2,
  PEDESTRIAN: 3,
} as const;
