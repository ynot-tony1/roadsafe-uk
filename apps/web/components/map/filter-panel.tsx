"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fetchAvailableFilters } from "@/lib/map/fetch-map-data";
import type { MapFiltersState } from "@/lib/map/query-string";
import type { AvailableFilters } from "@/lib/map/types";

const SEVERITY_OPTIONS = ["FATAL", "SERIOUS", "SLIGHT"];
const CURRENT_YEAR = new Date().getFullYear();

function toggleValue(values: string[] | undefined, value: string): string[] {
  const current = values ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function FilterPanel({
  filters,
  onFiltersChange,
}: {
  filters: MapFiltersState;
  onFiltersChange: (filters: MapFiltersState) => void;
}) {
  const [available, setAvailable] = useState<AvailableFilters | null>(null);

  useEffect(() => {
    fetchAvailableFilters()
      .then(setAvailable)
      .catch(() => setAvailable(null));
  }, []);

  const activeCount =
    (filters.severity?.length ?? 0) +
    (filters.roadUserType?.length ?? 0) +
    (filters.fromYear !== undefined || filters.toYear !== undefined ? 1 : 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4" align="start">
        <div className="space-y-2">
          <Label>Severity</Label>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_OPTIONS.map((severity) => {
              const active = filters.severity?.includes(severity) ?? false;
              return (
                <Button
                  key={severity}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() =>
                    onFiltersChange({ ...filters, severity: toggleValue(filters.severity, severity) })
                  }
                >
                  {severity.charAt(0) + severity.slice(1).toLowerCase()}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Road user involvement</Label>
          <div className="flex flex-wrap gap-2">
            {(available?.roadUserType ?? []).map((group) => {
              const active = filters.roadUserType?.includes(group) ?? false;
              return (
                <Button
                  key={group}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      roadUserType: toggleValue(filters.roadUserType, group),
                    })
                  }
                >
                  {group.replace(/_/g, " ").toLowerCase()}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="from-year">Year range</Label>
          <div className="flex items-center gap-2">
            <input
              id="from-year"
              type="number"
              min={1979}
              max={CURRENT_YEAR}
              value={filters.fromYear ?? ""}
              placeholder="From"
              className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  fromYear: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
            <span className="text-muted-foreground">to</span>
            <input
              id="to-year"
              type="number"
              min={1979}
              max={CURRENT_YEAR}
              value={filters.toYear ?? ""}
              placeholder="To"
              className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  toYear: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
        </div>

        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => onFiltersChange({})}>
            Clear all
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
