import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";

const ROAD_USER_LABELS: Record<string, string> = {
  PEDESTRIAN: "Pedestrians",
  CYCLIST: "Cyclists",
  MOTORCYCLIST: "Motorcyclists",
  CAR_OCCUPANT: "Car occupants",
  BUS_OR_COACH_OCCUPANT: "Bus or coach occupants",
  GOODS_VEHICLE_OCCUPANT: "Goods vehicle occupants",
  OTHER: "Other",
};

export interface RoadUserBreakdownRow {
  roadUserType: string;
  casualtyCount: number;
}

export function RoadUserBreakdown({ rows, year }: { rows: RoadUserBreakdownRow[]; year: number }) {
  const total = rows.reduce((sum, row) => sum + row.casualtyCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Casualties by road user type, {year}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => {
          const share = total > 0 ? Math.round((row.casualtyCount / total) * 100) : 0;
          return (
            <div key={row.roadUserType} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{ROAD_USER_LABELS[row.roadUserType] ?? row.roadUserType}</span>
                <span className="text-muted-foreground">
                  {formatCount(row.casualtyCount)} ({share}%)
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${share}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
