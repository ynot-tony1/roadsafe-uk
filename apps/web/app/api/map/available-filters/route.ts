import { prisma } from "@roadsafe-uk/database";
import { CASUALTY_TYPE_GROUPS, SEVERITY_LABELS } from "@roadsafe-uk/shared";
import { NextResponse } from "next/server";

const CODE_LIST_FIELDS = [
  "weather_conditions_code",
  "light_conditions_code",
  "road_surface_conditions_code",
  "junction_detail_code",
  "junction_control_code",
  "road_type_code",
  "first_road_class_code",
  "second_road_class_code",
  "special_conditions_at_site_code",
  "carriageway_hazards_code",
  "urban_rural_code",
  "vehicle_type_code",
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
