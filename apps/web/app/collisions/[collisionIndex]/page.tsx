import { prisma } from "@roadsafe-uk/database";
import { SEVERITY_LABELS, ageBandLabel } from "@roadsafe-uk/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CollisionLocationMap } from "@/components/collisions/collision-location-map";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

async function getCollision(collisionIndex: string) {
  return prisma.collision.findUnique({
    where: { collisionIndex },
    select: {
      collisionIndex: true,
      accidentYear: true,
      longitude: true,
      latitude: true,
      severityCode: true,
      numberOfVehicles: true,
      numberOfCasualties: true,
      date: true,
      time: true,
      localAuthorityDistrictCode: true,
      speedLimit: true,
      roadTypeCode: true,
      lightConditionsCode: true,
      weatherConditionsCode: true,
      roadSurfaceConditionsCode: true,
      sourceStatus: true,
      vehicles: {
        select: {
          id: true,
          vehicleReference: true,
          vehicleTypeCode: true,
          ageBandOfDriverCode: true,
        },
      },
      casualties: {
        select: {
          id: true,
          casualtyReference: true,
          casualtySeverityCode: true,
          casualtyTypeCode: true,
          ageBandOfCasualtyCode: true,
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ collisionIndex: string }>;
}): Promise<Metadata> {
  const { collisionIndex } = await params;
  return { title: `Collision ${collisionIndex}` };
}

export default async function CollisionDetailPage({
  params,
}: {
  params: Promise<{ collisionIndex: string }>;
}) {
  const { collisionIndex } = await params;
  const collision = await getCollision(collisionIndex);

  if (!collision) {
    notFound();
  }

  const styleUrl =
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <Link href="/map" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to map
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Collision {collision.collisionIndex}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={collision.severityCode === 1 ? "destructive" : "secondary"}>
            {SEVERITY_LABELS[collision.severityCode as 1 | 2 | 3] ?? collision.severityCode}
          </Badge>
          <Badge variant="outline">{collision.sourceStatus}</Badge>
          <span className="text-sm text-muted-foreground">
            {collision.date.toLocaleDateString("en-GB")}
            {collision.time ? ` at ${collision.time}` : ""}
          </span>
        </div>
      </div>

      {collision.latitude !== null && collision.longitude !== null ? (
        <CollisionLocationMap
          latitude={collision.latitude}
          longitude={collision.longitude}
          styleUrl={styleUrl}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Local authority</dt>
            <dd>{collision.localAuthorityDistrictCode}</dd>
            <dt className="text-muted-foreground">Vehicles involved</dt>
            <dd>{collision.numberOfVehicles}</dd>
            <dt className="text-muted-foreground">Casualties</dt>
            <dd>{collision.numberOfCasualties}</dd>
            <dt className="text-muted-foreground">Speed limit</dt>
            <dd>{collision.speedLimit ? `${collision.speedLimit} mph` : "Not recorded"}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehicles</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {collision.vehicles.map((vehicle) => (
              <li key={vehicle.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">Vehicle {vehicle.vehicleReference}</p>
                <p className="text-muted-foreground">
                  Driver age band:{" "}
                  {vehicle.ageBandOfDriverCode !== null
                    ? ageBandLabel(vehicle.ageBandOfDriverCode)
                    : "Not recorded"}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Casualties</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {collision.casualties.map((casualty) => (
              <li key={casualty.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">
                  {SEVERITY_LABELS[casualty.casualtySeverityCode as 1 | 2 | 3] ??
                    casualty.casualtySeverityCode}
                </p>
                <p className="text-muted-foreground">
                  Age band:{" "}
                  {casualty.ageBandOfCasualtyCode !== null
                    ? ageBandLabel(casualty.ageBandOfCasualtyCode)
                    : "Not recorded"}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
