"""Streaming import of the STATS19 collision CSV into the collisions table."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from psycopg import Connection

from roadsafe_ingestor import db
from roadsafe_ingestor.h3_utils import h3_indexes_for_point
from roadsafe_ingestor.importers.base import ImportResult, stream_parsed_batches
from roadsafe_ingestor.logging_config import get_logger, log_extra
from roadsafe_ingestor.models import CollisionRow

logger = get_logger(__name__)

# `updated_at` has no database-level default (Prisma's `@updatedAt` is set
# client-side on every write, not via a column DEFAULT), so raw-SQL inserts
# must supply it themselves, on both insert and re-import update.
COLUMNS = (
    "collision_index",
    "accident_year",
    "accident_reference",
    "location_easting_osgr",
    "location_northing_osgr",
    "longitude",
    "latitude",
    "police_force_code",
    "severity_code",
    "number_of_vehicles",
    "number_of_casualties",
    "date",
    "day_of_week_code",
    "time",
    "local_authority_district_code",
    "local_authority_highway_code",
    "first_road_class_code",
    "first_road_number",
    "road_type_code",
    "speed_limit",
    "junction_detail_code",
    "junction_control_code",
    "second_road_class_code",
    "second_road_number",
    "pedestrian_crossing_human_control_code",
    "pedestrian_crossing_physical_facilities_code",
    "light_conditions_code",
    "weather_conditions_code",
    "road_surface_conditions_code",
    "special_conditions_at_site_code",
    "carriageway_hazards_code",
    "urban_rural_code",
    "did_police_officer_attend_scene",
    "trunk_road_flag",
    "lsoa_code",
    "h3_resolution_5",
    "h3_resolution_7",
    "h3_resolution_9",
    "source_status",
    "source_revision",
    "updated_at",
)
CONFLICT_COLUMNS = ("collision_index",)
UPDATE_COLUMNS = tuple(c for c in COLUMNS if c not in CONFLICT_COLUMNS)


def _row_to_tuple(
    row: CollisionRow, *, source_status: str, source_revision: str
) -> tuple[Any, ...]:
    h3 = (
        h3_indexes_for_point(row.coordinates.longitude, row.coordinates.latitude)
        if row.coordinates
        else {}
    )
    return (
        row.collision_index,
        row.accident_year,
        row.accident_reference,
        row.location_easting_osgr,
        row.location_northing_osgr,
        row.coordinates.longitude if row.coordinates else None,
        row.coordinates.latitude if row.coordinates else None,
        row.police_force_code,
        row.severity_code,
        row.number_of_vehicles,
        row.number_of_casualties,
        row.date,
        row.day_of_week_code,
        row.time,
        row.local_authority_district_code,
        row.local_authority_highway_code,
        row.first_road_class_code,
        row.first_road_number,
        row.road_type_code,
        row.speed_limit,
        row.junction_detail_code,
        row.junction_control_code,
        row.second_road_class_code,
        row.second_road_number,
        row.pedestrian_crossing_human_control_code,
        row.pedestrian_crossing_physical_facilities_code,
        row.light_conditions_code,
        row.weather_conditions_code,
        row.road_surface_conditions_code,
        row.special_conditions_at_site_code,
        row.carriageway_hazards_code,
        row.urban_rural_code,
        row.did_police_officer_attend_scene,
        row.trunk_road_flag,
        row.lsoa_code,
        h3.get(5),
        h3.get(7),
        h3.get(9),
        source_status,
        source_revision,
        datetime.now(UTC),
    )


def import_collisions(
    conn: Connection,
    csv_path: Path,
    *,
    source_status: str,
    source_revision: str,
) -> ImportResult:
    final_result = ImportResult()
    for batch, running_result in stream_parsed_batches(csv_path, CollisionRow.from_raw_row):
        final_result = running_result
        rows = [
            _row_to_tuple(r, source_status=source_status, source_revision=source_revision)
            for r in batch
        ]
        inserted = db.execute_batch_upsert(
            conn,
            table="collisions",
            columns=COLUMNS,
            conflict_columns=CONFLICT_COLUMNS,
            update_columns=UPDATE_COLUMNS,
            rows=rows,
        )
        final_result.rows_inserted += inserted

    log_extra(
        logger,
        20,
        "collision import complete",
        rows_seen=final_result.rows_seen,
        rows_inserted=final_result.rows_inserted,
        rows_rejected=final_result.rows_rejected,
    )
    return final_result
