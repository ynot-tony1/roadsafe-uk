"use client";

import { DeckGL } from "@deck.gl/react";
import { MAP_QUERY_LIMITS, resolveZoomStrategy } from "@roadsafe-uk/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, Map, NavigationControl, type MapRef } from "react-map-gl/maplibre";

import { CollisionDetailSheet } from "@/components/map/collision-detail-sheet";
import { FilterPanel } from "@/components/map/filter-panel";
import { LegendPanel } from "@/components/map/legend-panel";
import { ModeSwitcher } from "@/components/map/mode-switcher";
import { ResultsTable } from "@/components/map/results-table";
import {
  buildClusterLayer,
  buildH3Layer,
  buildHeatmapLayer,
  buildPointsLayer,
  buildRoadsLayer,
} from "@/lib/map/build-layers";
import { buildMapQueryParams } from "@/lib/map/build-query";
import { fetchClusters, fetchCollisions, fetchH3, fetchRoads } from "@/lib/map/fetch-map-data";
import { useMapUrlState } from "@/lib/map/use-map-url-state";
import type { ClusterPoint, CollisionPoint, H3Cell, MapBounds, RoadSegmentGeo } from "@/lib/map/types";

import "maplibre-gl/dist/maplibre-gl.css";

const MOVE_DEBOUNCE_MS = 350;

export interface MapViewConfig {
  styleUrl: string;
  attribution: string;
  initialLatitude: number;
  initialLongitude: number;
  initialZoom: number;
}

export function MapView({ config }: { config: MapViewConfig }) {
  const mapRef = useRef<MapRef | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { mode, filters, setMode, setFilters } = useMapUrlState();

  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [zoom, setZoom] = useState(config.initialZoom);
  const [h3Cells, setH3Cells] = useState<H3Cell[]>([]);
  const [clusters, setClusters] = useState<ClusterPoint[]>([]);
  const [points, setPoints] = useState<CollisionPoint[]>([]);
  const [roads, setRoads] = useState<RoadSegmentGeo[]>([]);
  const [dataSource, setDataSource] = useState<"h3" | "clusters" | "points" | "roads">("h3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollisionIndex, setSelectedCollisionIndex] = useState<string | null>(null);

  const loadData = useCallback(
    async (nextBounds: MapBounds, nextZoom: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const strategy = resolveZoomStrategy(nextZoom);
        const params = buildMapQueryParams(nextBounds, filters, mode);

        if (mode === "ROAD_SAFETY") {
          const response = await fetchRoads(params, nextZoom, controller.signal);
          setDataSource("roads");
          setRoads(response.roads);
        } else if (mode === "INDIVIDUAL_COLLISIONS" || strategy.mode === "points") {
          const bboxArea = (nextBounds.maxLat - nextBounds.minLat) * (nextBounds.maxLng - nextBounds.minLng);
          if (bboxArea > MAP_QUERY_LIMITS.DEFAULT_MAX_BOUNDING_BOX_AREA_DEG2) {
            setDataSource("points");
            setPoints([]);
            setError("Zoom in further to see individual collisions in this area");
            return;
          }
          const response = await fetchCollisions(params, controller.signal);
          setDataSource("points");
          setPoints(response.collisions);
        } else if (mode === "HEATMAP" || mode === "CLUSTERS") {
          const response = await fetchClusters(params, nextZoom, controller.signal);
          setDataSource("clusters");
          setClusters(response.clusters);
        } else {
          const response = await fetchH3(params, nextZoom, controller.signal);
          setDataSource("h3");
          setH3Cells(response.cells);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setLoading(false);
      }
    },
    [filters, mode],
  );

  const debouncedLoad = useCallback(
    (nextBounds: MapBounds, nextZoom: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void loadData(nextBounds, nextZoom);
      }, MOVE_DEBOUNCE_MS);
    },
    [loadData],
  );

  const readBoundsFromMap = useCallback((): MapBounds | null => {
    const map = mapRef.current?.getMap();
    if (!map) return null;
    const b = map.getBounds();
    return {
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLng: b.getWest(),
      maxLng: b.getEast(),
    };
  }, []);

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap();
    const nextBounds = readBoundsFromMap();
    if (!nextBounds || !map) return;
    const nextZoom = map.getZoom();
    setBounds(nextBounds);
    setZoom(nextZoom);
    debouncedLoad(nextBounds, nextZoom);
  }, [readBoundsFromMap, debouncedLoad]);

  const handleMapLoad = useCallback(() => {
    handleMoveEnd();
  }, [handleMoveEnd]);

  // DeckGL's own controller (enabled via `controller` below) is what
  // actually receives mouse/touch/keyboard input, not the nested <Map>'s
  // native handlers, so panning or zooming with the mouse never fired the
  // underlying MapLibre `moveend` event `onMoveEnd` below listens for, the
  // data layer silently never refetched past the very first load no matter
  // how far the user panned or zoomed. onViewStateChange is deck.gl's own
  // guaranteed callback for exactly that interaction path. onMoveEnd is
  // kept too, since it's still what fires for the NavigationControl
  // zoom buttons, which call the native map directly and bypass deck.gl's
  // controller entirely.
  const handleViewStateChange = useCallback(() => {
    handleMoveEnd();
  }, [handleMoveEnd]);

  useEffect(() => {
    if (bounds) {
      debouncedLoad(bounds, zoom);
    }
    // Re-fetch whenever mode or filters change, reusing the last known bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filters]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const layers = useMemo(() => {
    if (dataSource === "roads") {
      return [buildRoadsLayer(roads, () => {})];
    }
    if (dataSource === "points") {
      return [buildPointsLayer(points, setSelectedCollisionIndex)];
    }
    if (dataSource === "clusters") {
      if (mode === "HEATMAP") return [buildHeatmapLayer(clusters)];
      return [buildClusterLayer(clusters, () => {})];
    }
    return [buildH3Layer(mode, h3Cells, () => {})];
  }, [dataSource, mode, h3Cells, clusters, points, roads]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModeSwitcher mode={mode} onModeChange={setMode} />
        <FilterPanel filters={filters} onFiltersChange={setFilters} />
      </div>

      {error ? (
        <p role="status" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="relative h-[65vh] min-h-[400px] overflow-hidden rounded-lg border border-border">
        <DeckGL
          initialViewState={{
            longitude: config.initialLongitude,
            latitude: config.initialLatitude,
            zoom: config.initialZoom,
          }}
          controller
          layers={layers}
          onViewStateChange={handleViewStateChange}
        >
          <Map
            ref={mapRef}
            mapStyle={config.styleUrl}
            attributionControl={false}
            onLoad={handleMapLoad}
            onMoveEnd={handleMoveEnd}
          >
            <NavigationControl position="top-right" />
            <AttributionControl position="bottom-right" customAttribution={config.attribution} />
          </Map>
        </DeckGL>

        {loading ? (
          <div
            role="status"
            className="absolute left-3 top-3 rounded-md bg-background/95 px-2 py-1 text-xs shadow-sm"
          >
            Loading...
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs">
          <div className="pointer-events-auto">
            <LegendPanel mode={mode} />
          </div>
        </div>
      </div>

      {dataSource === "roads" ? (
        <ResultsTable kind="roads" rows={roads} />
      ) : dataSource === "points" ? (
        <ResultsTable kind="points" rows={points} onSelect={setSelectedCollisionIndex} />
      ) : dataSource === "clusters" ? (
        <ResultsTable kind="clusters" rows={clusters} />
      ) : (
        <ResultsTable kind="h3" rows={h3Cells} />
      )}

      <CollisionDetailSheet
        collisionIndex={selectedCollisionIndex}
        onOpenChange={(open) => !open && setSelectedCollisionIndex(null)}
      />
    </div>
  );
}
