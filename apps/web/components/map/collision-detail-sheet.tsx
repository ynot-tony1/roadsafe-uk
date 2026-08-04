"use client";

import { SEVERITY_LABELS, ageBandLabel } from "@roadsafe-uk/shared";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchCollisionDetail } from "@/lib/map/fetch-map-data";
import type { CollisionDetail } from "@/lib/map/types";

function CollisionDetailContent({ collisionIndex }: { collisionIndex: string }) {
  const [detail, setDetail] = useState<CollisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCollisionDetail(collisionIndex)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [collisionIndex]);

  if (error) {
    return <p className="px-4 text-sm text-destructive">{error}</p>;
  }

  if (!detail) {
    return <p className="px-4 text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4 px-4 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={detail.severityCode === 1 ? "destructive" : "secondary"}>
          {SEVERITY_LABELS[detail.severityCode as 1 | 2 | 3] ?? detail.severityCode}
        </Badge>
        <Badge variant="outline">{detail.sourceStatus}</Badge>
        <span className="text-sm text-muted-foreground">
          {new Date(detail.date).toLocaleDateString("en-GB")}
          {detail.time ? ` at ${detail.time}` : ""}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Local authority</dt>
        <dd>{detail.localAuthorityDistrictCode}</dd>
        <dt className="text-muted-foreground">Vehicles involved</dt>
        <dd>{detail.numberOfVehicles}</dd>
        <dt className="text-muted-foreground">Casualties</dt>
        <dd>{detail.numberOfCasualties}</dd>
        <dt className="text-muted-foreground">Speed limit</dt>
        <dd>{detail.speedLimit ? `${detail.speedLimit} mph` : "Not recorded"}</dd>
      </dl>

      <Separator />

      <div>
        <h3 className="mb-2 text-sm font-medium">Vehicles</h3>
        <ul className="space-y-2">
          {detail.vehicles.map((vehicle) => (
            <li key={vehicle.id} className="rounded-md border border-border p-2 text-sm">
              <p>Vehicle {vehicle.vehicleReference}</p>
              <p className="text-muted-foreground">
                Driver age band:{" "}
                {vehicle.ageBandOfDriverCode !== null
                  ? ageBandLabel(vehicle.ageBandOfDriverCode)
                  : "Not recorded"}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <Separator />

      <div>
        <h3 className="mb-2 text-sm font-medium">Casualties</h3>
        <ul className="space-y-2">
          {detail.casualties.map((casualty) => (
            <li key={casualty.id} className="rounded-md border border-border p-2 text-sm">
              <p>
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
      </div>
    </div>
  );
}

export function CollisionDetailSheet({
  collisionIndex,
  onOpenChange,
}: {
  collisionIndex: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={collisionIndex !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Collision {collisionIndex}</SheetTitle>
        </SheetHeader>

        {collisionIndex ? (
          <CollisionDetailContent key={collisionIndex} collisionIndex={collisionIndex} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
