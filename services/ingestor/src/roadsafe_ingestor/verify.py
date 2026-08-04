"""Post-import verification checks (spec section 11 and section 21).

`run` only marks a year active after every check here passes.
"""

from __future__ import annotations

from dataclasses import dataclass

from psycopg import Connection, Cursor

from roadsafe_ingestor.logging_config import get_logger, log_extra

logger = get_logger(__name__)


@dataclass
class VerificationCheck:
    name: str
    passed: bool
    detail: str


def _fetch_one_count(cur: Cursor) -> int:
    row = cur.fetchone()
    assert row is not None
    return int(row[0])


def verify_year(conn: Connection, *, year: int) -> list[VerificationCheck]:
    checks: list[VerificationCheck] = []

    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM collisions WHERE accident_year = %s AND source_status = 'FINAL'",
            (year,),
        )
        collision_count = _fetch_one_count(cur)
        checks.append(
            VerificationCheck(
                "collisions_present",
                collision_count > 0,
                f"{collision_count} final collisions found for {year}",
            )
        )

        cur.execute(
            """
            SELECT count(*) FROM vehicles v
            LEFT JOIN collisions c ON c.collision_index = v.collision_index
            WHERE c.collision_index IS NULL
            """
        )
        orphan_vehicles = _fetch_one_count(cur)
        checks.append(
            VerificationCheck(
                "vehicles_reference_collisions",
                orphan_vehicles == 0,
                f"{orphan_vehicles} vehicles reference a missing collision",
            )
        )

        cur.execute(
            """
            SELECT count(*) FROM casualties cas
            LEFT JOIN collisions c ON c.collision_index = cas.collision_index
            WHERE c.collision_index IS NULL
            """
        )
        orphan_casualties = _fetch_one_count(cur)
        checks.append(
            VerificationCheck(
                "casualties_reference_collisions",
                orphan_casualties == 0,
                f"{orphan_casualties} casualties reference a missing collision",
            )
        )

        cur.execute(
            """
            SELECT count(*) FROM (
                SELECT collision_index FROM collisions
                WHERE accident_year = %s AND source_status = 'FINAL'
                GROUP BY collision_index HAVING count(*) > 1
            ) duplicates
            """,
            (year,),
        )
        duplicate_collisions = _fetch_one_count(cur)
        checks.append(
            VerificationCheck(
                "no_duplicate_collision_keys",
                duplicate_collisions == 0,
                f"{duplicate_collisions} duplicate collision_index values",
            )
        )

        cur.execute(
            """
            SELECT count(*) FROM collisions
            WHERE accident_year = %s AND source_status = 'FINAL'
              AND number_of_vehicles < (
                SELECT count(*) FROM vehicles v WHERE v.collision_index = collisions.collision_index
              ) - 5
            """,
            (year,),
        )
        vehicle_count_mismatches = _fetch_one_count(cur)
        checks.append(
            VerificationCheck(
                "vehicle_counts_broadly_agree",
                vehicle_count_mismatches == 0,
                f"{vehicle_count_mismatches} collisions where number_of_vehicles diverges "
                "sharply from imported vehicle rows",
            )
        )

    for check in checks:
        log_extra(
            logger,
            20 if check.passed else 40,
            "verification check",
            check=check.name,
            passed=check.passed,
            detail=check.detail,
        )

    return checks


def all_passed(checks: list[VerificationCheck]) -> bool:
    return all(c.passed for c in checks)
