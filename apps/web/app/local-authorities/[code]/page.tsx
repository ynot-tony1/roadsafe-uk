import { prisma } from "@roadsafe-uk/database";
import { KSI_SEVERITY_CODES, SEVERITY_LABELS } from "@roadsafe-uk/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RoadUserBreakdown } from "@/components/dashboard/road-user-breakdown";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";

export const revalidate = 3600;

const LOCAL_AUTHORITY_TOTAL_WHERE = {
  geographyType: "local_authority",
  severityCode: null,
  roadUserType: null,
  roadCondition: null,
  timeCategory: null,
  dimensionValue: null,
  sourceStatus: "FINAL",
} as const;

async function getLocalAuthority(code: string) {
  return prisma.localAuthority.findUnique({ where: { code } });
}

async function getLocalAuthorityMetrics(code: string) {
  const totals = await prisma.annualMetric.findMany({
    where: { ...LOCAL_AUTHORITY_TOTAL_WHERE, geographyCode: code },
    orderBy: { year: "asc" },
    select: { year: true, collisionCount: true, casualtyCount: true },
  });

  const latestYear = totals.at(-1)?.year;
  if (latestYear === undefined) {
    return { totals, severityBreakdown: [], roadUserBreakdown: [] };
  }

  const [severityBreakdown, roadUserBreakdown] = await Promise.all([
    prisma.annualMetric.findMany({
      where: {
        ...LOCAL_AUTHORITY_TOTAL_WHERE,
        geographyCode: code,
        severityCode: undefined,
        year: latestYear,
        NOT: { severityCode: null },
      },
      select: { severityCode: true, collisionCount: true },
    }),
    prisma.annualMetric.findMany({
      where: {
        ...LOCAL_AUTHORITY_TOTAL_WHERE,
        geographyCode: code,
        roadUserType: undefined,
        year: latestYear,
        NOT: { roadUserType: null },
      },
      select: { roadUserType: true, casualtyCount: true },
      orderBy: { casualtyCount: "desc" },
    }),
  ]);

  return { totals, severityBreakdown, roadUserBreakdown };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const la = await getLocalAuthority(code);
  return { title: la ? la.name : "Local authority" };
}

export default async function LocalAuthorityPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const localAuthority = await getLocalAuthority(code);

  if (!localAuthority) {
    notFound();
  }

  const { totals, severityBreakdown, roadUserBreakdown } = await getLocalAuthorityMetrics(code);
  const latest = totals.at(-1);

  const ksiCount = severityBreakdown
    .filter((row) => row.severityCode !== null && (KSI_SEVERITY_CODES as number[]).includes(row.severityCode))
    .reduce((sum, row) => sum + row.collisionCount, 0);

  const populationRate =
    latest && localAuthority.populationDenominator
      ? (latest.collisionCount / localAuthority.populationDenominator) * 100_000
      : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div>
        <Link href="/local-authorities" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to local authorities
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{localAuthority.name}</h1>
        {localAuthority.region ? (
          <p className="text-muted-foreground">{localAuthority.region}</p>
        ) : null}
      </div>

      {!latest ? (
        <EmptyState
          title="No collision data for this local authority yet"
          description="STATS19 data has not been ingested yet, so no statistics are available."
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
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Collisions per 100,000 population
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight">
                  {populationRate !== null ? populationRate.toFixed(1) : "No data"}
                </p>
                {localAuthority.populationDenominator ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Based on a population of {formatCount(localAuthority.populationDenominator)}
                    {localAuthority.populationDenominatorYear
                      ? ` (${localAuthority.populationDenominatorYear})`
                      : ""}
                    {localAuthority.populationSource ? `, ${localAuthority.populationSource}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No population denominator recorded for this local authority
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <TrendChart data={totals} />

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

          <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
            {severityBreakdown.map((row) => (
              <span key={row.severityCode}>
                {SEVERITY_LABELS[row.severityCode as 1 | 2 | 3] ?? row.severityCode}:{" "}
                {formatCount(row.collisionCount)}
              </span>
            ))}
          </div>
        </>
      )}

      <Button asChild variant="outline" className="w-fit">
        <Link href={`/map?localAuthority=${localAuthority.code}`}>View on map</Link>
      </Button>
    </div>
  );
}
