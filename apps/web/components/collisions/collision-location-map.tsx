"use client";

import { Marker, Map as MapLibreMap, NavigationControl } from "react-map-gl/maplibre";

import "maplibre-gl/dist/maplibre-gl.css";

export function CollisionLocationMap({
  latitude,
  longitude,
  styleUrl,
}: {
  latitude: number;
  longitude: number;
  styleUrl: string;
}) {
  return (
    <div className="h-64 overflow-hidden rounded-lg border border-border">
      <MapLibreMap
        initialViewState={{ latitude, longitude, zoom: 14 }}
        mapStyle={styleUrl}
        attributionControl={false}
      >
        <NavigationControl position="top-right" />
        <Marker latitude={latitude} longitude={longitude} color="#b91c1c" />
      </MapLibreMap>
    </div>
  );
}
