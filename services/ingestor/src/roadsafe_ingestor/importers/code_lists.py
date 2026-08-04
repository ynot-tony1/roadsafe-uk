"""Loads config/stats19-code-lists/code-lists.json into the code_definitions table."""

from __future__ import annotations

import json
import uuid
from typing import Any

from psycopg import Connection

from roadsafe_ingestor import db
from roadsafe_ingestor.logging_config import get_logger, log_extra
from roadsafe_ingestor.settings import Settings

logger = get_logger(__name__)

# `id` has no database-level default (Prisma's `@default(uuid())` generates
# the value client-side, not via a column DEFAULT), so raw-SQL inserts must
# supply one themselves. Not part of CONFLICT_COLUMNS/UPDATE_COLUMNS: an
# existing row keeps its own id across a re-import.
COLUMNS = (
    "id",
    "dataset_name",
    "field_name",
    "code",
    "label",
    "valid_from_year",
    "valid_to_year",
    "source_version",
)
CONFLICT_COLUMNS = ("dataset_name", "field_name", "code", "valid_from_year")
UPDATE_COLUMNS = ("label", "valid_to_year", "source_version")


def import_code_lists(conn: Connection, settings: Settings) -> int:
    with settings.code_lists_path.open() as f:
        payload = json.load(f)

    source_version = payload["source_version"]
    valid_from_year_default = payload["valid_from_year_default"]

    rows: list[tuple[Any, ...]] = []
    for dataset_name, fields in payload["definitions"].items():
        for field_name, codes in fields.items():
            for entry in codes:
                rows.append(
                    (
                        str(uuid.uuid4()),
                        dataset_name,
                        field_name,
                        entry["code"],
                        entry["label"],
                        valid_from_year_default,
                        None,
                        source_version,
                    )
                )

    inserted = db.execute_batch_upsert(
        conn,
        table="code_definitions",
        columns=COLUMNS,
        conflict_columns=CONFLICT_COLUMNS,
        update_columns=UPDATE_COLUMNS,
        rows=rows,
    )
    log_extra(logger, 20, "code list import complete", rows_inserted=inserted)
    return inserted
