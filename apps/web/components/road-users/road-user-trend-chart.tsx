"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";

const SERIES_COLORS: Record<string, string> = {
  PEDESTRIAN: "#2563eb",
  CYCLIST: "#16a34a",
  MOTORCYCLIST: "#9333ea",
  CAR_OCCUPANT: "#ca8a04",
  BUS_OR_COACH_OCCUPANT: "#0891b2",
  GOODS_VEHICLE_OCCUPANT: "#be185d",
  OTHER: "#6b7280",
};

const SERIES_LABELS: Record<string, string> = {
  PEDESTRIAN: "Pedestrians",
  CYCLIST: "Cyclists",
  MOTORCYCLIST: "Motorcyclists",
  CAR_OCCUPANT: "Car occupants",
  BUS_OR_COACH_OCCUPANT: "Bus or coach occupants",
  GOODS_VEHICLE_OCCUPANT: "Goods vehicle occupants",
  OTHER: "Other",
};

export interface RoadUserTrendRow {
  year: number;
  [roadUserType: string]: number;
}

export function RoadUserTrendChart({
  data,
  series,
}: {
  data: RoadUserTrendRow[];
  series: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Casualties by road user type, by year</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="year" fontSize={12} tickLine={false} />
            <YAxis fontSize={12} tickLine={false} width={48} />
            <Tooltip formatter={(value: number) => formatCount(value)} />
            <Legend formatter={(value: string) => SERIES_LABELS[value] ?? value} />
            {series.map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={SERIES_COLORS[key] ?? "#6b7280"}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
