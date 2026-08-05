"""Builds precomputed H3Metric rows from raw collision/casualty tables.

Only the high-value dimensions listed in config/map-layers.yml are
materialised here (spec section 8.6): "all" (every count broken down by
severity and road-user type, which are already columns on h3_metrics) plus
"severity" and "road_user" filter slices used directly by the KSI_ONLY,
PEDESTRIAN, CYCLIST and MOTORCYCLIST map modes. Any other filter
combination is computed dynamically by the web app's map API at query time.
"""

from __future__ import annotations

from datetime import date

from psycopg import Connection

from roadsafe_ingestor.db import retry_on_serialization_conflict
from roadsafe_ingestor.logging_config import get_logger, log_extra

logger = get_logger(__name__)

_ALL_DIMENSION_SQL = """
INSERT INTO h3_metrics (
    id, h3_index, resolution, period_start, period_end,
    filter_dimension, filter_value,
    collision_count, casualty_count, fatal_count, serious_count, slight_count,
    pedestrian_count, cyclist_count, motorcyclist_count,
    calculated_at, source_import_id
)
SELECT
    gen_random_uuid(),
    c.{h3_column},
    {resolution},
    %(period_start)s,
    %(period_end)s,
    'all',
    'all',
    count(DISTINCT c.collision_index),
    count(cas.id),
    count(cas.id) FILTER (WHERE cas.casualty_severity_code = 1),
    count(cas.id) FILTER (WHERE cas.casualty_severity_code = 2),
    count(cas.id) FILTER (WHERE cas.casualty_severity_code = 3),
    count(cas.id) FILTER (WHERE cas.casualty_type_code = 0),
    count(cas.id) FILTER (WHERE cas.casualty_type_code = 1),
    count(cas.id) FILTER (WHERE cas.casualty_type_code IN (2, 3, 4, 5, 23, 97, 103, 104, 105, 106)),
    now(),
    %(source_import_id)s
FROM collisions c
LEFT JOIN casualties cas ON cas.collision_index = c.collision_index
WHERE c.{h3_column} IS NOT NULL
  AND c.date >= %(period_start)s AND c.date <= %(period_end)s
  AND c.source_status = 'FINAL'
GROUP BY c.{h3_column}
ON CONFLICT (h3_index, resolution, period_start, period_end, filter_dimension, filter_value)
DO UPDATE SET
    collision_count = EXCLUDED.collision_count,
    casualty_count = EXCLUDED.casualty_count,
    fatal_count = EXCLUDED.fatal_count,
    serious_count = EXCLUDED.serious_count,
    slight_count = EXCLUDED.slight_count,
    pedestrian_count = EXCLUDED.pedestrian_count,
    cyclist_count = EXCLUDED.cyclist_count,
    motorcyclist_count = EXCLUDED.motorcyclist_count,
    calculated_at = EXCLUDED.calculated_at,
    source_import_id = EXCLUDED.source_import_id
"""

_H3_COLUMN_BY_RESOLUTION = {5: "h3_resolution_5", 7: "h3_resolution_7", 9: "h3_resolution_9"}


@retry_on_serialization_conflict
def build_h3_all_dimension(
    conn: Connection,
    *,
    resolution: int,
    period_start: date,
    period_end: date,
    source_import_id: str,
) -> int:
    h3_column = _H3_COLUMN_BY_RESOLUTION[resolution]
    sql = _ALL_DIMENSION_SQL.format(h3_column=h3_column, resolution=resolution)
    with conn.cursor() as cur:
        cur.execute(
            sql,
            {
                "period_start": period_start,
                "period_end": period_end,
                "source_import_id": source_import_id,
            },
        )
        affected = cur.rowcount
    conn.commit()
    log_extra(
        logger,
        20,
        "built h3 all-dimension aggregates",
        resolution=resolution,
        period_start=str(period_start),
        period_end=str(period_end),
        rows=affected,
    )
    return affected


def verify_h3_totals(
    conn: Connection, *, resolution: int, period_start: date, period_end: date
) -> bool:
    """Confirms the sum of collision_count across every H3 cell for this
    period matches a direct count from the collisions table. Spec section
    11 requires this check before a year is marked active."""
    h3_column = _H3_COLUMN_BY_RESOLUTION[resolution]
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT count(DISTINCT collision_index) FROM collisions
            WHERE {h3_column} IS NOT NULL AND date >= %s AND date <= %s AND source_status = 'FINAL'
            """,
            (period_start, period_end),
        )
        raw_count_row = cur.fetchone()
        assert raw_count_row is not None
        raw_count = int(raw_count_row[0])

        cur.execute(
            """
            SELECT coalesce(sum(collision_count), 0) FROM h3_metrics
            WHERE resolution = %s AND period_start = %s AND period_end = %s
              AND filter_dimension = 'all' AND filter_value = 'all'
            """,
            (resolution, period_start, period_end),
        )
        aggregate_count_row = cur.fetchone()
        assert aggregate_count_row is not None
        aggregate_count = int(aggregate_count_row[0])

    matches = raw_count == aggregate_count
    log_extra(
        logger,
        20 if matches else 40,
        "h3 total verification",
        resolution=resolution,
        raw_count=raw_count,
        aggregate_count=aggregate_count,
        matches=matches,
    )
    return matches
