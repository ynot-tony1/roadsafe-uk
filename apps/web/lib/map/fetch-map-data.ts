import type {
  AvailableFilters,
  ClustersResponse,
  CollisionDetail,
  CollisionsResponse,
  H3Response,
  LegendResponse,
  RoadsResponse,
} from "@/lib/map/types";

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === "string" ? body.error : `Request to ${url} failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

export async function fetchH3(
  params: URLSearchParams,
  zoom: number,
  signal?: AbortSignal,
): Promise<H3Response> {
  const withZoom = new URLSearchParams(params);
  withZoom.set("zoom", String(zoom));
  return fetchJson<H3Response>(`/api/map/h3?${withZoom.toString()}`, signal);
}

export async function fetchClusters(
  params: URLSearchParams,
  zoom: number,
  signal?: AbortSignal,
): Promise<ClustersResponse> {
  const withZoom = new URLSearchParams(params);
  withZoom.set("zoom", String(zoom));
  return fetchJson<ClustersResponse>(`/api/map/clusters?${withZoom.toString()}`, signal);
}

export async function fetchCollisions(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<CollisionsResponse> {
  return fetchJson<CollisionsResponse>(`/api/map/collisions?${params.toString()}`, signal);
}

export async function fetchRoads(
  params: URLSearchParams,
  zoom: number,
  signal?: AbortSignal,
): Promise<RoadsResponse> {
  const withZoom = new URLSearchParams(params);
  withZoom.set("zoom", String(zoom));
  return fetchJson<RoadsResponse>(`/api/map/roads?${withZoom.toString()}`, signal);
}

export async function fetchCollisionDetail(collisionIndex: string): Promise<CollisionDetail> {
  return fetchJson<CollisionDetail>(`/api/map/collisions/${encodeURIComponent(collisionIndex)}`);
}

export async function fetchLegend(mode: string): Promise<LegendResponse> {
  return fetchJson<LegendResponse>(`/api/map/legend?mode=${encodeURIComponent(mode)}`);
}

export async function fetchAvailableFilters(): Promise<AvailableFilters> {
  return fetchJson<AvailableFilters>("/api/map/available-filters");
}
