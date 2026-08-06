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

# A single unbounded UPDATE across the whole country hit connect()'s
# statement_timeout (the road network grew from Cumbria's 77,913 segments
# in the benchmark that measured ~1,000/s to 5.2 million once every UK
# region was imported, so real per-collision candidate counts in dense
# areas are far higher against the full table). Chunking keeps every
# individual statement well inside statement_timeout regardless of how
# many segments now exist.
DEFAULT_BATCH_SIZE = 2000

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


def _select_candidate_batch(
    conn: Connection,
    *,
    bbox_clause: str,
    bbox_params: list[float],
    after_cursor: str,
    batch_size: int,
) -> list[str]:
    """Picks the next batch_size collisions (by collision_index order,
    resuming after after_cursor) that still need snapping. Cheap: a plain
    index-friendly scan/sort, no spatial join here at all."""
    sql = f"""
    SELECT collision_index FROM collisions
    WHERE road_segment_id IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL
      AND collision_index > %s
      {bbox_clause}
    ORDER BY collision_index
    LIMIT %s
    """
    with conn.cursor() as cur:
        cur.execute(sql, [after_cursor, *bbox_params, batch_size])
        return [row[0] for row in cur.fetchall()]


@retry_on_serialization_conflict
def _snap_candidate_ids(
    conn: Connection, *, collision_ids: list[str], distance_meters: float
) -> int:
    # Bounding the spatial join to an explicit, small, known set of
    # collision_index values (rather than letting CockroachDB discover the
    # candidate set itself) is what keeps this fast regardless of local
    # road/collision density. A version of this query that instead let the
    # planner pick the candidate set via ORDER BY + LIMIT inside the same
    # statement worked fine in Cumbria's road/collision density but showed
    # a multi-billion-row estimated sort in central London (EXPLAIN),
    # timing out even at a batch size of 20, because DISTINCT ON's
    # semantics forced CockroachDB to fully materialise the join across
    # every matching collision in scope before any LIMIT could apply.
    sql = """
    UPDATE collisions c
    SET road_segment_id = nearest.rs_id
    FROM (
        SELECT DISTINCT ON (b.collision_index)
            b.collision_index,
            rs.id AS rs_id
        FROM collisions b
        JOIN road_segments rs
            ON ST_DWithin(
                rs.geometry,
                ST_SetSRID(ST_MakePoint(b.longitude, b.latitude), 4326),
                %s
            )
        WHERE b.collision_index = ANY(%s)
          AND ST_Distance(
                rs.geometry::GEOGRAPHY,
                ST_SetSRID(ST_MakePoint(b.longitude, b.latitude), 4326)::GEOGRAPHY
              ) <= %s
        ORDER BY b.collision_index,
            ST_Distance(
                rs.geometry::GEOGRAPHY,
                ST_SetSRID(ST_MakePoint(b.longitude, b.latitude), 4326)::GEOGRAPHY
            )
    ) AS nearest
    WHERE c.collision_index = nearest.collision_index
    """
    with conn.cursor() as cur:
        cur.execute(sql, [BROAD_PHASE_DEGREES, collision_ids, distance_meters])
        matched = cur.rowcount
    conn.commit()
    return matched


def snap_collisions_to_roads(
    conn: Connection,
    *,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lng: float | None = None,
    max_lng: float | None = None,
    distance_meters: float = DEFAULT_SNAP_DISTANCE_METERS,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> int:
    """Sets road_segment_id on every collision within the given bbox (or
    every collision with coordinates, if no bbox given) that doesn't already
    have one and has a road segment within distance_meters. Safe to re-run:
    only ever touches rows where road_segment_id IS NULL, so re-running
    after importing more road network coverage picks up newly-matchable
    collisions without re-processing already-matched ones.

    Paginates by a collision_index cursor, not by "did the last batch match
    fewer than batch_size collisions": some collisions genuinely never
    match (no road within distance_meters) and would otherwise stay
    road_segment_id IS NULL forever, silently starving that termination
    check into stopping early. An earlier version used exactly that check
    and stopped after processing under 2,200 of 513,801 collisions in
    production, having correctly matched everything in its one and only
    batch, then wrongly concluded there was nothing left to do. The cursor
    tracks candidates *seen*, not matched, so it always reaches the true
    end of the table regardless of how many candidates along the way turn
    out to be unmatchable.
    """
    bbox_clause = ""
    bbox_params: list[float] = []
    if min_lat is not None:
        assert (
            max_lat is not None and min_lng is not None and max_lng is not None
        ), "min_lat, max_lat, min_lng, max_lng must all be given together, or not at all"
        bbox_clause = "AND longitude BETWEEN %s AND %s AND latitude BETWEEN %s AND %s"
        bbox_params = [min_lng, max_lng, min_lat, max_lat]

    total_matched = 0
    total_seen = 0
    after_cursor = ""
    while True:
        candidate_ids = _select_candidate_batch(
            conn,
            bbox_clause=bbox_clause,
            bbox_params=bbox_params,
            after_cursor=after_cursor,
            batch_size=batch_size,
        )
        if not candidate_ids:
            break
        matched = _snap_candidate_ids(
            conn, collision_ids=candidate_ids, distance_meters=distance_meters
        )
        total_matched += matched
        total_seen += len(candidate_ids)
        after_cursor = candidate_ids[-1]
        log_extra(
            logger,
            20,
            "collisions snapped to road segments (batch)",
            seen=len(candidate_ids),
            matched=matched,
            total_seen=total_seen,
            total_matched=total_matched,
        )
        if len(candidate_ids) < batch_size:
            break
    return total_matched


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
