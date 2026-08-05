import { prisma } from "@roadsafe-uk/database";
import { CASUALTY_TYPE_GROUPS, SEVERITY_LABELS } from "@roadsafe-uk/shared";
import { NextResponse } from "next/server";

// Must match code_definitions.field_name as seeded by
// config/stats19-code-lists/code-lists.json: raw STATS19 names, no
// `_code` suffix (unlike the collisions table's own column names).
const CODE_LIST_FIELDS = [
  "weather_conditions",
  "light_conditions",
  "road_surface_conditions",
  "junction_detail",
  "junction_control",
  "road_type",
  "first_road_class",
  "second_road_class",
  "special_conditions_at_site",
  "carriageway_hazards",
  "urban_or_rural_area",
  "vehicle_type",
];

export async function GET() {
  const definitions = await prisma.codeDefinition.findMany({
    where: {
      fieldName: { in: CODE_LIST_FIELDS },
      validToYear: null,
    },
    select: { fieldName: true, code: true, label: true },
    orderBy: [{ fieldName: "asc" }, { code: "asc" }],
  });

  const codeLists: Record<string, { code: number; label: string }[]> = {};
  for (const field of CODE_LIST_FIELDS) {
    codeLists[field] = [];
  }
  for (const def of definitions) {
    codeLists[def.fieldName]?.push({ code: def.code, label: def.label });
  }

  const localAuthorities = await prisma.localAuthority.findMany({
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    severity: Object.entries(SEVERITY_LABELS).map(([code, label]) => ({
      code: Number(code),
      label,
    })),
    roadUserType: Object.keys(CASUALTY_TYPE_GROUPS),
    localAuthorities,
    codeLists,
  });
}
