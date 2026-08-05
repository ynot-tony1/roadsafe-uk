"""Snaps collisions onto the nearest OSM road segment, then aggregates
each segment's collision history into a safety rating.

Doing this as one client round trip per collision was tried first and
measured at under 0.8 collisions/second: EXPLAIN ANALYZE showed each
individual query only took ~4ms of actual server-side execution, the rest
was pure network round-trip latency to the cluster (gcp-europe-west2).
A single set-based UPDATE covering many collisions at once removes nearly
all of that round-trip cost and was measured near 1,000 collisions/second
once the broad-phase spatial filter was tightened (see BROAD_PHASE_DEGREES).
"""

from __future__ import annotations

from psycopg import Connection

from roadsafe_ingestor.db import retry_on_serialization_conflict
from roadsafe_ingestor.logging_config import get_logger, log_extra

logger = get_logger(__name__)

DEFAULT_SNAP_DISTANCE_METERS = 30

# Index-accelerated pre-filter in raw degree space (ST_DWithin against the
# geometry column, not a geography cast, so the GIST index on road_segments
# is actually used, confirmed via EXPLAIN). Degrees-per-metre shrinks in the
# east-west direction the further north you go; 0.0008 degrees stays a safe
# upper bound for DEFAULT_SNAP_DISTANCE_METERS even at Great Britain's
# northernmost latitudes (~60degN), where a metre is worth more degrees than
# anywhere further south. This is only a candidate filter: the real cutoff
# is the exact geography-based ST_Distance check below, which is what
# actually enforces distance_meters.
BROAD_PHASE_DEGREES = 0.0008


@retry_on_serialization_conflict
def snap_collisions_to_roads(
    conn: Connection,
    *,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lng: float | None = None,
    max_lng: float | None = None,
    distance_meters: float = DEFAULT_SNAP_DISTANCE_METERS,
) -> int:
    """Sets road_segment_id on every collision within the given bbox (or
    every collision with coordinates, if no bbox given) that doesn't already
    have one and has a road segment within distance_meters. Safe to re-run:
    only ever touches rows where road_segment_id IS NULL, so re-running
    after importing more road network coverage picks up newly-matchable
    collisions without re-processing already-matched ones."""
    bbox_clause = ""
    params: list[float] = []
    if min_lat is not None:
        assert (
            max_lat is not None and min_lng is not None and max_lng is not None
        ), "min_lat, max_lat, min_lng, max_lng must all be given together, or not at all"
        bbox_clause = "AND c2.longitude BETWEEN %s AND %s AND c2.latitude BETWEEN %s AND %s"
        params = [min_lng, max_lng, min_lat, max_lat]

    sql = f"""
    UPDATE collisions c
    SET road_segment_id = nearest.rs_id
    FROM (
        SELECT DISTINCT ON (c2.collision_index)
            c2.collision_index,
            rs.id AS rs_id
        FROM collisions c2
        JOIN road_segments rs
            ON ST_DWithin(
                rs.geometry,
                ST_SetSRID(ST_MakePoint(c2.longitude, c2.latitude), 4326),
                %s
            )
        WHERE c2.longitude IS NOT NULL AND c2.latitude IS NOT NULL
          AND c2.road_segment_id IS NULL
          AND ST_Distance(
                rs.geometry::GEOGRAPHY,
                ST_SetSRID(ST_MakePoint(c2.longitude, c2.latitude), 4326)::GEOGRAPHY
              ) <= %s
          {bbox_clause}
        ORDER BY c2.collision_index,
            ST_Distance(
                rs.geometry::GEOGRAPHY,
                ST_SetSRID(ST_MakePoint(c2.longitude, c2.latitude), 4326)::GEOGRAPHY
            )
    ) AS nearest
    WHERE c.collision_index = nearest.collision_index
    """
    with conn.cursor() as cur:
        cur.execute(sql, [BROAD_PHASE_DEGREES, distance_meters, *params])
        matched = cur.rowcount
    conn.commit()
    log_extra(logger, 20, "collisions snapped to road segments", matched=matched)
    return matched


# Mirrors the exact wording of the requested rating scheme: neutral if no
# crashes, amber if some low-severity, darker amber if more severity, red
# for very severe or many. "More severity" and "very severe" are read as
# an escalation on either a single collision's severity (serious/fatal) or
# on volume (a road with many slight collisions is still worse than one
# with a single slight collision), matching how the map's own severity
# legend already treats serious/fatal as the more dangerous end of the
# scale elsewhere in this codebase.
DARK_AMBER_MIN_COLLISIONS = 4
RED_MIN_COLLISIONS = 10


@retry_on_serialization_conflict
def compute_road_safety_ratings(conn: Connection) -> int:
    """Recomputes collision_count/fatal_count/serious_count/slight_count and
    safety_rating for every road_segment with at least one snapped
    collision. Segments with none keep the column default (0 counts,
    NEUTRAL), never touched by this UPDATE."""
    sql = """
    UPDATE road_segments rs
    SET collision_count = agg.collision_count,
        fatal_count = agg.fatal_count,
        serious_count = agg.serious_count,
        slight_count = agg.slight_count,
        safety_rating = CASE
            WHEN agg.fatal_count >= 1 OR agg.collision_count >= %s THEN 'RED'
            WHEN agg.serious_count >= 1 OR agg.collision_count >= %s THEN 'DARK_AMBER'
            ELSE 'AMBER'
        END,
        calculated_at = now()
    FROM (
        SELECT
            road_segment_id,
            count(*) AS collision_count,
            count(*) FILTER (WHERE severity_code = 1) AS fatal_count,
            count(*) FILTER (WHERE severity_code = 2) AS serious_count,
            count(*) FILTER (WHERE severity_code = 3) AS slight_count
        FROM collisions
        WHERE road_segment_id IS NOT NULL AND source_status = 'FINAL'
        GROUP BY road_segment_id
    ) AS agg
    WHERE rs.id = agg.road_segment_id
    """
    with conn.cursor() as cur:
        cur.execute(sql, [RED_MIN_COLLISIONS, DARK_AMBER_MIN_COLLISIONS])
        updated = cur.rowcount
    conn.commit()
    log_extra(logger, 20, "road safety ratings recomputed", segments_updated=updated)
    return updated
