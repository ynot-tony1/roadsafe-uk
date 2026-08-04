import { prisma } from "@roadsafe-uk/database";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = {
  title: "Hotspots",
  description: "Local authorities ranked by collision counts and rates, shown separately with their denominators.",
};

export const revalidate = 3600;

const LOCAL_AUTHORITY_TOTAL_WHERE = {
  geographyType: "local_authority",
  roadUserType: null,
  roadCondition: null,
  timeCategory: null,
  dimensionValue: null,
  sourceStatus: "FINAL",
} as const;

interface RankRow {
  code: string;
  name: string;
  value: number;
  detail: string;
}

async function getHotspotRankings() {
  const latestYearResult = await prisma.annualMetric.aggregate({
    where: { geographyType: "local_authority", sourceStatus: "FINAL" },
    _max: { year: true },
  });
  const year = latestYearResult._max.year;
  if (!year) return { year: null, byCollisions: [], byKsi: [], byKsiRate: [] };

  const [totals, severityRows, authorities] = await Promise.all([
    prisma.annualMetric.findMany({
      where: { ...LOCAL_AUTHORITY_TOTAL_WHERE, year, severityCode: null },
      select: { geographyCode: true, collisionCount: true },
    }),
    prisma.annualMetric.findMany({
      where: { ...LOCAL_AUTHORITY_TOTAL_WHERE, year, severityCode: undefined, NOT: { severityCode: null } },
      select: { geographyCode: true, severityCode: true, collisionCount: true },
    }),
    prisma.localAuthority.findMany({
      select: { code: true, name: true, populationDenominator: true, populationDenominatorYear: true },
    }),
  ]);

  const nameByCode = new Map(authorities.map((a) => [a.code, a.name]));
  const populationByCode = new Map(
    authorities.filter((a) => a.populationDenominator).map((a) => [a.code, a]),
  );

  const ksiByCode = new Map<string, number>();
  for (const row of severityRows) {
    if (row.severityCode === 1 || row.severityCode === 2) {
      ksiByCode.set(row.geographyCode, (ksiByCode.get(row.geographyCode) ?? 0) + row.collisionCount);
    }
  }

  const byCollisions: RankRow[] = totals
    .map((row) => ({
      code: row.geographyCode,
      name: nameByCode.get(row.geographyCode) ?? row.geographyCode,
      value: row.collisionCount,
      detail: `${formatCount(row.collisionCount)} collisions in ${year}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  const byKsi: RankRow[] = Array.from(ksiByCode.entries())
    .map(([code, count]) => ({
      code,
      name: nameByCode.get(code) ?? code,
      value: count,
      detail: `${formatCount(count)} killed or seriously injured in ${year}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  const byKsiRate: RankRow[] = Array.from(ksiByCode.entries())
    .flatMap(([code, count]) => {
      const la = populationByCode.get(code);
      if (!la?.populationDenominator) return [];
      const rate = (count / la.populationDenominator) * 100_000;
      return [
        {
          code,
          name: nameByCode.get(code) ?? code,
          value: rate,
          detail: `${rate.toFixed(1)} per 100,000 population (${formatCount(la.populationDenominator)}, ${la.populationDenominatorYear ?? "year not recorded"})`,
        },
      ];
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  return { year, byCollisions, byKsi, byKsiRate };
}

function RankTable({ rows }: { rows: RankRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No data available for this ranking.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Local authority</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.code}>
              <TableCell className="text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <Link
                  href={`/local-authorities/${row.code}`}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{row.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function HotspotsPage() {
  const { year, byCollisions, byKsi, byKsiRate } = await getHotspotRankings();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hotspots</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Local authorities ranked by collision statistics{year ? ` for ${year}` : ""}. Each ranking
          uses one clearly labelled metric, there is no single blended &quot;danger score&quot;,
          since a high count often just reflects more traffic or population, not necessarily more
          risk. Rate based rankings show their denominator and its source year.
        </p>
      </div>

      {!year ? (
        <EmptyState
          title="No data to rank yet"
          description="Rankings are built from ingested STATS19 data, which has not been imported yet."
        />
      ) : (
        <Tabs defaultValue="collisions">
          <TabsList>
            <TabsTrigger value="collisions">Most collisions</TabsTrigger>
            <TabsTrigger value="ksi">Most killed or seriously injured</TabsTrigger>
            <TabsTrigger value="ksi-rate">KSI rate per population</TabsTrigger>
          </TabsList>
          <TabsContent value="collisions" className="mt-4">
            <RankTable rows={byCollisions} />
          </TabsContent>
          <TabsContent value="ksi" className="mt-4">
            <RankTable rows={byKsi} />
          </TabsContent>
          <TabsContent value="ksi-rate" className="mt-4">
            <RankTable rows={byKsiRate} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
