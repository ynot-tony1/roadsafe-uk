import type { Metadata } from "next";

import { MapView } from "@/components/map/map-view";

export const metadata: Metadata = {
  title: "Map",
  description: "Interactive map of police reported road collisions across Great Britain.",
};

export default function MapPage() {
  const config = {
    styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty",
    attribution:
      process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ??
      "© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors",
    initialLatitude: Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_LATITUDE ?? 54.5),
    initialLongitude: Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_LONGITUDE ?? -3.5),
    initialZoom: Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_ZOOM ?? 5.2),
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Collision map</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Pan and zoom to explore collisions. The map switches between aggregated hexagons and
          individual collision points depending on zoom level.
        </p>
      </div>
      <MapView config={config} />
    </div>
  );
}
