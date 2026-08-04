import { prisma } from "@roadsafe-uk/database";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  title: "Status",
  description: "Data freshness and ingestion pipeline status for RoadSafe UK.",
};

export const revalidate = 300;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCEEDED: "default",
  RUNNING: "secondary",
  PENDING: "secondary",
  PARTIAL: "outline",
  FAILED: "destructive",
};

export default async function StatusPage() {
  const [runs, collisionCount, latestFinalYear, latestProvisionalYear, codeDefinitionCount] =
    await Promise.all([
      prisma.ingestionRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
      prisma.collision.count(),
      prisma.collision.aggregate({
        where: { sourceStatus: "FINAL" },
        _max: { accidentYear: true },
      }),
      prisma.collision.aggregate({
        where: { sourceStatus: "PROVISIONAL" },
        _max: { accidentYear: true },
      }),
      prisma.codeDefinition.count(),
    ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Live data freshness and the history of the ingestion pipeline that loads DfT STATS19
          data into this application.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Collisions in database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatCount(collisionCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Latest final year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {latestFinalYear._max.accidentYear ?? "None yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Latest provisional year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {latestProvisionalYear._max.accidentYear ?? "None"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reference code definitions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatCount(codeDefinitionCount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingestion runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No ingestion runs have been recorded yet. This application has a live database
              connection and API, but no STATS19 data has been imported.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Inserted</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{run.sourceYear}</TableCell>
                      <TableCell>{run.sourceStatus}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[run.status] ?? "outline"}>{run.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCount(run.rowsInserted)}</TableCell>
                      <TableCell className="text-right">{formatCount(run.rowsRejected)}</TableCell>
                      <TableCell>{run.startedAt.toLocaleString("en-GB")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
