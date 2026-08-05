"""Loads config/local-authorities/local-authorities.json into the
local_authorities table.

Reference data only (code, name, country-level region), not derived from
STATS19 itself: population/traffic/road-length denominators and boundary
URLs are left null here and are a separate, not-yet-scoped data source.
"""

from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from roadsafe_ingestor import db
from roadsafe_ingestor.logging_config import get_logger, log_extra
from roadsafe_ingestor.settings import Settings

logger = get_logger(__name__)

COLUMNS = ("code", "name", "region")
CONFLICT_COLUMNS = ("code",)
UPDATE_COLUMNS = ("name", "region")


def import_local_authorities(conn: Connection, settings: Settings) -> int:
    with settings.local_authorities_path.open() as f:
        payload = json.load(f)

    rows: list[tuple[Any, ...]] = [
        (a["code"], a["name"], a.get("region")) for a in payload["authorities"]
    ]

    inserted = db.execute_batch_upsert(
        conn,
        table="local_authorities",
        columns=COLUMNS,
        conflict_columns=CONFLICT_COLUMNS,
        update_columns=UPDATE_COLUMNS,
        rows=rows,
    )
    log_extra(logger, 20, "local authority import complete", rows_inserted=inserted)
    return inserted
