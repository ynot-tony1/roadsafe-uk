"""Streaming import of the STATS19 vehicle CSV into the vehicles table.

Every row must reference a collision that has already been imported. Rows
that fail that foreign key check are counted as rejected rather than
silently dropped or allowed to abort the whole batch.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from psycopg import Connection

from roadsafe_ingestor import db
from roadsafe_ingestor.importers.base import ImportResult, stream_parsed_batches
from roadsafe_ingestor.logging_config import get_logger, log_extra
from roadsafe_ingestor.models import VehicleRow

logger = get_logger(__name__)

# `id` has no database-level default (Prisma's `@default(uuid())` generates
# the value client-side, not via a column DEFAULT), so raw-SQL inserts must
# supply one themselves. Not part of CONFLICT_COLUMNS/UPDATE_COLUMNS: an
# existing row keeps its own id across a re-import.
COLUMNS = (
    "id",
    "collision_index",
    "vehicle_reference",
    "vehicle_type_code",
    "towing_and_articulation_code",
    "vehicle_manoeuvre_code",
    "vehicle_direction_from_code",
    "vehicle_direction_to_code",
    "vehicle_location_restricted_lane",
    "junction_location_code",
    "skidding_and_overturning_code",
    "hit_object_in_carriageway_code",
    "vehicle_leaving_carriageway_code",
    "hit_object_off_carriageway_code",
    "first_point_of_impact_code",
    "vehicle_left_hand_drive",
    "journey_purpose_code",
    "sex_of_driver_code",
    "age_of_driver",
    "age_band_of_driver_code",
    "engine_capacity_cc",
    "propulsion_code",
    "age_of_vehicle",
    "generic_make_model",
    "driver_imd_decile",
    "updated_at",
)
CONFLICT_COLUMNS = ("collision_index", "vehicle_reference")
UPDATE_COLUMNS = tuple(c for c in COLUMNS if c not in CONFLICT_COLUMNS and c != "id")


def _row_to_tuple(row: VehicleRow) -> tuple[Any, ...]:
    return (
        str(uuid.uuid4()),
        row.collision_index,
        row.vehicle_reference,
        row.vehicle_type_code,
        row.towing_and_articulation_code,
        row.vehicle_manoeuvre_code,
        row.vehicle_direction_from_code,
        row.vehicle_direction_to_code,
        row.vehicle_location_restricted_lane,
        row.junction_location_code,
        row.skidding_and_overturning_code,
        row.hit_object_in_carriageway_code,
        row.vehicle_leaving_carriageway_code,
        row.hit_object_off_carriageway_code,
        row.first_point_of_impact_code,
        row.vehicle_left_hand_drive,
        row.journey_purpose_code,
        row.sex_of_driver_code,
        row.age_of_driver,
        row.age_band_of_driver_code,
        row.engine_capacity_cc,
        row.propulsion_code,
        row.age_of_vehicle,
        row.generic_make_model,
        row.driver_imd_decile,
        datetime.now(UTC),
    )


def import_vehicles(conn: Connection, csv_path: Path) -> ImportResult:
    final_result = ImportResult()
    for batch, running_result in stream_parsed_batches(csv_path, VehicleRow.from_raw_row):
        final_result = running_result
        rows = [_row_to_tuple(r) for r in batch]
        references = [f"{r.collision_index}:{r.vehicle_reference}" for r in batch]
        inserted, fk_rejections = db.execute_batch_upsert_with_fk_fallback(
            conn,
            table="vehicles",
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
        "vehicle import complete",
        rows_seen=final_result.rows_seen,
        rows_inserted=final_result.rows_inserted,
        rows_rejected=final_result.rows_rejected,
    )
    return final_result
