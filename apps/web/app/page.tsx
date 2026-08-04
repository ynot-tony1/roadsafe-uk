import { prisma } from "@roadsafe-uk/database";
import { KSI_SEVERITY_CODES, SEVERITY_LABELS } from "@roadsafe-uk/shared";
import Link from "next/link";

import { RoadUserBreakdown } from "@/components/dashboard/road-user-breakdown";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { formatYearRange } from "@/lib/format";

export const revalidate = 3600;

const NATIONAL_TOTAL_WHERE = {
  geographyType: "national",
  geographyCode: "GB",
  severityCode: null,
  roadUserType: null,
  roadCondition: null,
  timeCategory: null,
  dimensionValue: null,
  sourceStatus: "FINAL",
} as const;

async function getNationalDashboardData() {
  const nationalTotals = await prisma.annualMetric.findMany({
    where: NATIONAL_TOTAL_WHERE,
    orderBy: { year: "asc" },
    select: { year: true, collisionCount: true, casualtyCount: true },
  });

  const latestYear = nationalTotals.at(-1)?.year;
  if (latestYear === undefined) {
    return { nationalTotals, latestYear: null, severityBreakdown: [], roadUserBreakdown: [] };
  }

  const [severityBreakdown, roadUserBreakdown] = await Promise.all([
    prisma.annualMetric.findMany({
      where: {
        ...NATIONAL_TOTAL_WHERE,
        severityCode: undefined,
        year: latestYear,
        NOT: { severityCode: null },
      },
      select: { severityCode: true, collisionCount: true },
    }),
    prisma.annualMetric.findMany({
      where: {
        ...NATIONAL_TOTAL_WHERE,
        roadUserType: undefined,
        year: latestYear,
        NOT: { roadUserType: null },
      },
      select: { roadUserType: true, casualtyCount: true },
      orderBy: { casualtyCount: "desc" },
    }),
  ]);

  return { nationalTotals, latestYear, severityBreakdown, roadUserBreakdown };
}

export default async function Home() {
  const { nationalTotals, severityBreakdown, roadUserBreakdown } = await getNationalDashboardData();

  const latest = nationalTotals.at(-1);
  const ksiCount = severityBreakdown
    .filter((row) => row.severityCode !== null && (KSI_SEVERITY_CODES as number[]).includes(row.severityCode))
    .reduce((sum, row) => sum + row.collisionCount, 0);
  const fatalCount =
    severityBreakdown.find((row) => row.severityCode === 1)?.collisionCount ?? 0;

  const yearRange =
    nationalTotals.length > 0
      ? formatYearRange(nationalTotals[0].year, nationalTotals[nationalTotals.length - 1].year)
      : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">National dashboard</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Police reported personal injury road collisions across Great Britain, sourced from the
          DfT STATS19 dataset{yearRange ? `, ${yearRange}` : ""}.
        </p>
      </div>

      {!latest ? (
        <EmptyState
          title="No collision data has been ingested yet"
          description="The database schema and API are live, but no STATS19 data has been imported. Check the status page for the current ingestion state."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/status">View status</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={`Collisions, ${latest.year}`} value={latest.collisionCount} />
            <StatCard label={`Casualties, ${latest.year}`} value={latest.casualtyCount} />
            <StatCard
              label="Killed or seriously injured"
              value={ksiCount}
              accentClassName="text-orange-600 dark:text-orange-400"
              footnote={`${SEVERITY_LABELS[1]} and ${SEVERITY_LABELS[2].toLowerCase()} combined`}
            />
            <StatCard
              label="Fatal collisions"
              value={fatalCount}
              accentClassName="text-red-700 dark:text-red-400"
            />
          </div>

          <TrendChart data={nationalTotals} />

          {roadUserBreakdown.length > 0 ? (
            <RoadUserBreakdown
              rows={roadUserBreakdown.flatMap((row) =>
                row.roadUserType !== null
                  ? [{ roadUserType: row.roadUserType, casualtyCount: row.casualtyCount }]
                  : [],
              )}
              year={latest.year}
            />
          ) : null}
        </>
      )}

      <div className="flex gap-3">
        <Button asChild>
          <Link href="/map">Open the interactive map</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/about/data">About the data</Link>
        </Button>
      </div>
    </div>
  );
}
