"use client";

import { MAP_MODES } from "@roadsafe-uk/shared";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const MODE_LABELS: Record<string, string> = {
  HEATMAP: "Heatmap",
  H3_HEXAGONS: "Hexagons",
  CLUSTERS: "Clusters",
  INDIVIDUAL_COLLISIONS: "Individual",
  KSI_ONLY: "KSI only",
  PEDESTRIAN: "Pedestrian",
  CYCLIST: "Cyclist",
  MOTORCYCLIST: "Motorcyclist",
  YOUNG_DRIVER: "Young driver",
};

export function ModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: string;
  onModeChange: (mode: string) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => value && onModeChange(value)}
      className="flex-wrap justify-start"
      aria-label="Map layer mode"
    >
      {MAP_MODES.map((m) => (
        <ToggleGroupItem key={m} value={m} size="sm" aria-label={MODE_LABELS[m]}>
          {MODE_LABELS[m]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
