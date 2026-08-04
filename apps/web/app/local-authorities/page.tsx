import { prisma } from "@roadsafe-uk/database";
import type { Metadata } from "next";

import { LocalAuthorityTable, type LocalAuthorityRow } from "@/components/local-authorities/local-authority-table";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = {
  title: "Local authorities",
  description: "Collision statistics by local authority across Great Britain.",
};

export const revalidate = 3600;

async function getLocalAuthorityRows(): Promise<LocalAuthorityRow[]> {
  const authorities = await prisma.localAuthority.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true, region: true },
  });

  if (authorities.length === 0) return [];

  const latestYear = await prisma.annualMetric.aggregate({
    where: { geographyType: "local_authority", sourceStatus: "FINAL" },
    _max: { year: true },
  });
  const year = latestYear._max.year;

  const counts = year
    ? await prisma.annualMetric.findMany({
        where: {
          geographyType: "local_authority",
          year,
          severityCode: null,
          roadUserType: null,
          roadCondition: null,
          timeCategory: null,
          dimensionValue: null,
          sourceStatus: "FINAL",
        },
        select: { geographyCode: true, collisionCount: true },
      })
    : [];
  const countByCode = new Map(counts.map((c) => [c.geographyCode, c.collisionCount]));

  return authorities.map((la) => ({
    code: la.code,
    name: la.name,
    region: la.region,
    latestYear: year,
    collisionCount: countByCode.get(la.code) ?? null,
  }));
}

export default async function LocalAuthoritiesPage() {
  const rows = await getLocalAuthorityRows();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Local authorities</h1>
        <p className="mt-1 text-muted-foreground">
          Collision statistics for every local authority in Great Britain.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No local authority reference data yet"
          description="Local authority boundaries and denominators are loaded as part of ingestion, which has not run yet."
        />
      ) : (
        <LocalAuthorityTable rows={rows} />
      )}
    </div>
  );
}
