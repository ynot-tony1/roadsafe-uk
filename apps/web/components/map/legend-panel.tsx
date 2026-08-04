"use client";

import { useEffect, useState } from "react";

import { fetchLegend } from "@/lib/map/fetch-map-data";
import type { LegendResponse } from "@/lib/map/types";

export function LegendPanel({ mode }: { mode: string }) {
  const [legend, setLegend] = useState<LegendResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLegend(mode)
      .then((data) => {
        if (!cancelled) setLegend(data);
      })
      .catch(() => {
        if (!cancelled) setLegend(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!legend) return null;

  return (
    <div className="rounded-lg border border-border bg-background/95 p-3 text-sm shadow-sm backdrop-blur">
      <p className="mb-2 font-medium">{legend.title}</p>
      <ul className="space-y-1">
        {legend.items.map((item) => (
          <li key={item.code} className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
