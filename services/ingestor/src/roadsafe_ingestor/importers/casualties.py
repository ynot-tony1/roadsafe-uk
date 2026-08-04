"""Streaming import of the STATS19 casualty CSV into the casualties table."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from psycopg import Connection

from roadsafe_ingestor import db
from roadsafe_ingestor.importers.base import ImportResult, stream_parsed_batches
from roadsafe_ingestor.logging_config import get_logger, log_extra
from roadsafe_ingestor.models import CasualtyRow

logger = get_logger(__name__)

COLUMNS = (
    "collision_index",
    "vehicle_reference",
    "casualty_reference",
    "casualty_class_code",
    "sex_of_casualty_code",
    "age_of_casualty",
    "age_band_of_casualty_code",
    "casualty_severity_code",
    "pedestrian_location_code",
    "pedestrian_movement_code",
    "car_passenger_code",
    "bus_or_coach_passenger_code",
    "pedestrian_road_maintenance_worker_code",
    "casualty_type_code",
    "casualty_home_area_type_code",
    "casualty_imd_decile",
)
CONFLICT_COLUMNS = ("collision_index", "vehicle_reference", "casualty_reference")
UPDATE_COLUMNS = tuple(c for c in COLUMNS if c not in CONFLICT_COLUMNS)


def _row_to_tuple(row: CasualtyRow) -> tuple[Any, ...]:
    return (
        row.collision_index,
        row.vehicle_reference,
        row.casualty_reference,
        row.casualty_class_code,
        row.sex_of_casualty_code,
        row.age_of_casualty,
        row.age_band_of_casualty_code,
        row.casualty_severity_code,
        row.pedestrian_location_code,
        row.pedestrian_movement_code,
        row.car_passenger_code,
        row.bus_or_coach_passenger_code,
        row.pedestrian_road_maintenance_worker_code,
        row.casualty_type_code,
        row.casualty_home_area_type_code,
        row.casualty_imd_decile,
    )


def import_casualties(conn: Connection, csv_path: Path) -> ImportResult:
    final_result = ImportResult()
    for batch, running_result in stream_parsed_batches(csv_path, CasualtyRow.from_raw_row):
        final_result = running_result
        rows = [_row_to_tuple(r) for r in batch]
        references = [
            f"{r.collision_index}:{r.vehicle_reference}:{r.casualty_reference}" for r in batch
        ]
        inserted, fk_rejections = db.execute_batch_upsert_with_fk_fallback(
            conn,
            table="casualties",
            columns=COLUMNS,
            conflict_columns=CONFLICT_COLUMNS,
            update_columns=UPDATE_COLUMNS,
            rows=rows,
            row_reference=references,
        )
        final_result.rows_inserted += inserted
        final_result.rows_rejected += len(fk_rejections)
        final_result.rejections.extend(fk_rejections[:10])

    log_extra(
        logger,
        20,
        "casualty import complete",
        rows_seen=final_result.rows_seen,
        rows_inserted=final_result.rows_inserted,
        rows_rejected=final_result.rows_rejected,
    )
    return final_result
