"""Builds precomputed AnnualMetric rows backing the dashboard and the
local-authority explorer, so those pages never scan raw collision rows.
"""

from __future__ import annotations

from typing import Any

from psycopg import Connection

from roadsafe_ingestor.logging_config import get_logger, log_extra

logger = get_logger(__name__)


def _upsert(conn: Connection, rows: list[tuple[Any, ...]]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO annual_metrics (
        id, year, geography_type, geography_code, severity_code, road_user_type,
        road_condition, time_category, dimension_value,
        collision_count, casualty_count, source_status, calculated_at, source_import_id
    ) VALUES (
        gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), %s
    )
    ON CONFLICT (year, geography_type, geography_code, severity_code, road_user_type,
                 road_condition, time_category, dimension_value, source_status)
    DO UPDATE SET
        collision_count = EXCLUDED.collision_count,
        casualty_count = EXCLUDED.casualty_count,
        calculated_at = EXCLUDED.calculated_at,
        source_import_id = EXCLUDED.source_import_id
    """
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        affected = cur.rowcount
    conn.commit()
    return affected


# Mirrors packages/shared/src/road-user.ts CASUALTY_TYPE_GROUPS, kept in sync by hand since
# the ingestor and the web app are separate language runtimes.
_ROAD_USER_TYPE_CASE_SQL = """
    CASE
        WHEN cas.casualty_type_code IN (0) THEN 'PEDESTRIAN'
        WHEN cas.casualty_type_code IN (1) THEN 'CYCLIST'
        WHEN cas.casualty_type_code IN (2, 3, 4, 5, 23, 97, 103, 104, 105, 106) THEN 'MOTORCYCLIST'
        WHEN cas.casualty_type_code IN (8, 9, 108, 109) THEN 'CAR_OCCUPANT'
        WHEN cas.casualty_type_code IN (11, 110) THEN 'BUS_OR_COACH_OCCUPANT'
        WHEN cas.casualty_type_code IN (19, 20, 21, 98, 113, 119) THEN 'GOODS_VEHICLE_OCCUPANT'
        ELSE 'OTHER'
    END
"""


def build_national_annual_metrics(conn: Connection, *, year: int, source_import_id: str) -> int:
    rows: list[tuple[Any, ...]] = []

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(DISTINCT c.collision_index), count(cas.id)
            FROM collisions c LEFT JOIN casualties cas ON cas.collision_index = c.collision_index
            WHERE c.accident_year = %s AND c.source_status = 'FINAL'
            """,
            (year,),
        )
        national_row = cur.fetchone()
        assert national_row is not None
        collision_count, casualty_count = national_row
        rows.append(
            (
                year,
                "national",
                "GB",
                None,
                None,
                None,
                None,
                None,
                collision_count,
                casualty_count,
                "FINAL",
                source_import_id,
            )
        )

        cur.execute(
            """
            SELECT cas.casualty_severity_code, count(DISTINCT c.collision_index), count(cas.id)
            FROM collisions c JOIN casualties cas ON cas.collision_index = c.collision_index
            WHERE c.accident_year = %s AND c.source_status = 'FINAL'
            GROUP BY cas.casualty_severity_code
            """,
            (year,),
        )
        for severity_code, coll_count, cas_count in cur.fetchall():
            rows.append(
                (
                    year,
                    "national",
                    "GB",
                    severity_code,
                    None,
                    None,
                    None,
                    None,
                    coll_count,
                    cas_count,
                    "FINAL",
                    source_import_id,
                )
            )

        cur.execute(
            """
            SELECT c.local_authority_district_code, count(DISTINCT c.collision_index), count(cas.id)
            FROM collisions c LEFT JOIN casualties cas ON cas.collision_index = c.collision_index
            WHERE c.accident_year = %s AND c.source_status = 'FINAL'
            GROUP BY c.local_authority_district_code
            """,
            (year,),
        )
        for la_code, coll_count, cas_count in cur.fetchall():
            rows.append(
                (
                    year,
                    "local_authority",
                    la_code,
                    None,
                    None,
                    None,
                    None,
                    None,
                    coll_count,
                    cas_count,
                    "FINAL",
                    source_import_id,
                )
            )

        cur.execute(
            f"""
            SELECT {_ROAD_USER_TYPE_CASE_SQL} AS road_user_type,
                   count(DISTINCT c.collision_index), count(cas.id)
            FROM collisions c JOIN casualties cas ON cas.collision_index = c.collision_index
            WHERE c.accident_year = %s AND c.source_status = 'FINAL'
            GROUP BY road_user_type
            """,
            (year,),
        )
        for road_user_type, coll_count, cas_count in cur.fetchall():
            rows.append(
                (
                    year,
                    "national",
                    "GB",
                    None,
                    road_user_type,
                    None,
                    None,
                    None,
                    coll_count,
                    cas_count,
                    "FINAL",
                    source_import_id,
                )
            )

        cur.execute(
            """
            SELECT c.local_authority_district_code, cas.casualty_severity_code,
                   count(DISTINCT c.collision_index), count(cas.id)
            FROM collisions c JOIN casualties cas ON cas.collision_index = c.collision_index
            WHERE c.accident_year = %s AND c.source_status = 'FINAL'
            GROUP BY c.local_authority_district_code, cas.casualty_severity_code
            """,
            (year,),
        )
        for la_code, severity_code, coll_count, cas_count in cur.fetchall():
            rows.append(
                (
                    year,
                    "local_authority",
                    la_code,
                    severity_code,
                    None,
                    None,
                    None,
                    None,
                    coll_count,
                    cas_count,
                    "FINAL",
                    source_import_id,
                )
            )

        cur.execute(
            f"""
            SELECT c.local_authority_district_code, {_ROAD_USER_TYPE_CASE_SQL} AS road_user_type,
                   count(DISTINCT c.collision_index), count(cas.id)
            FROM collisions c JOIN casualties cas ON cas.collision_index = c.collision_index
            WHERE c.accident_year = %s AND c.source_status = 'FINAL'
            GROUP BY c.local_authority_district_code, road_user_type
            """,
            (year,),
        )
        for la_code, road_user_type, coll_count, cas_count in cur.fetchall():
            rows.append(
                (
                    year,
                    "local_authority",
                    la_code,
                    None,
                    road_user_type,
                    None,
                    None,
                    None,
                    coll_count,
                    cas_count,
                    "FINAL",
                    source_import_id,
                )
            )

    affected = _upsert(conn, rows)
    log_extra(logger, 20, "built national annual metrics", year=year, rows=affected)
    return affected
