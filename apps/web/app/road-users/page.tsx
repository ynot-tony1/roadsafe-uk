import { prisma } from "@roadsafe-uk/database";
import type { Metadata } from "next";

import { RoadUserBreakdown } from "@/components/dashboard/road-user-breakdown";
import { EmptyState } from "@/components/empty-state";
import { RoadUserTrendChart, type RoadUserTrendRow } from "@/components/road-users/road-user-trend-chart";

export const metadata: Metadata = {
  title: "Road users",
  description: "Casualties by road user type across Great Britain.",
};

export const revalidate = 3600;

const NATIONAL_ROAD_USER_WHERE = {
  geographyType: "national",
  geographyCode: "GB",
  severityCode: null,
  roadCondition: null,
  timeCategory: null,
  dimensionValue: null,
  sourceStatus: "FINAL",
} as const;

async function getRoadUserData() {
  const rows = await prisma.annualMetric.findMany({
    where: { ...NATIONAL_ROAD_USER_WHERE, roadUserType: undefined, NOT: { roadUserType: null } },
    orderBy: { year: "asc" },
    select: { year: true, roadUserType: true, casualtyCount: true },
  });

  const seriesSet = new Set<string>();
  const byYear = new Map<number, RoadUserTrendRow>();
  for (const row of rows) {
    if (!row.roadUserType) continue;
    seriesSet.add(row.roadUserType);
    const existing = byYear.get(row.year) ?? { year: row.year };
    existing[row.roadUserType] = row.casualtyCount;
    byYear.set(row.year, existing);
  }

  const trend = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  const latestYear = trend.at(-1)?.year;
  const latestYearBreakdown = latestYear
    ? rows
        .filter((r) => r.year === latestYear && r.roadUserType)
        .map((r) => ({ roadUserType: r.roadUserType as string, casualtyCount: r.casualtyCount }))
        .sort((a, b) => b.casualtyCount - a.casualtyCount)
    : [];

  return { trend, series: Array.from(seriesSet), latestYear, latestYearBreakdown };
}

export default async function RoadUsersPage() {
  const { trend, series, latestYear, latestYearBreakdown } = await getRoadUserData();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Road users</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Casualties broken down by the type of road user involved: pedestrians, cyclists,
          motorcyclists, and vehicle occupants.
        </p>
      </div>

      {trend.length === 0 ? (
        <EmptyState
          title="No road user data yet"
          description="This breakdown is built from ingested STATS19 data, which has not been imported yet."
        />
      ) : (
        <>
          <RoadUserTrendChart data={trend} series={series} />
          {latestYear ? (
            <RoadUserBreakdown rows={latestYearBreakdown} year={latestYear} />
          ) : null}
        </>
      )}
    </div>
  );
}
