"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { MapFiltersState } from "@/lib/map/query-string";

const DEFAULT_MODE = "H3_HEXAGONS";

function subscribeToUrl(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getSearchParamsSnapshot(): string {
  return window.location.search;
}

function getServerSnapshot(): string {
  return "";
}

export interface MapUrlState {
  mode: string;
  filters: MapFiltersState;
  setMode: (mode: string) => void;
  setFilters: (filters: MapFiltersState) => void;
}

export function useMapUrlState(): MapUrlState {
  const search = useSyncExternalStore(subscribeToUrl, getSearchParamsSnapshot, getServerSnapshot);

  const { mode, filters } = useMemo(() => {
    const params = new URLSearchParams(search);
    const fromYear = params.get("fromYear");
    const toYear = params.get("toYear");
    return {
      mode: params.get("mode") ?? DEFAULT_MODE,
      filters: {
        fromYear: fromYear ? Number(fromYear) : undefined,
        toYear: toYear ? Number(toYear) : undefined,
        severity: params.getAll("severity"),
        roadUserType: params.getAll("roadUserType"),
      } satisfies MapFiltersState,
    };
  }, [search]);

  const replaceUrl = useCallback((mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const setMode = useCallback(
    (nextMode: string) => {
      replaceUrl((params) => params.set("mode", nextMode));
    },
    [replaceUrl],
  );

  const setFilters = useCallback(
    (nextFilters: MapFiltersState) => {
      replaceUrl((params) => {
        params.delete("fromYear");
        params.delete("toYear");
        params.delete("severity");
        params.delete("roadUserType");
        if (nextFilters.fromYear !== undefined) {
          params.set("fromYear", String(nextFilters.fromYear));
        }
        if (nextFilters.toYear !== undefined) {
          params.set("toYear", String(nextFilters.toYear));
        }
        for (const s of nextFilters.severity ?? []) params.append("severity", s);
        for (const r of nextFilters.roadUserType ?? []) params.append("roadUserType", r);
      });
    },
    [replaceUrl],
  );

  return { mode, filters, setMode, setFilters };
}
