"""Loads OpenStreetMap road geometry into road_segments.

Geometry comes from Geofabrik .osm.pbf extracts (see docs/road-safety-ratings.md
for the exact download URLs used), never STATS19 itself: STATS19 only ever
records a road number/class per collision, never the road's actual shape.

Only vehicle-carrying highway classes are imported. STATS19 is exclusively
motor vehicle collisions, so purely pedestrian/cycle infrastructure (footway,
path, steps, bridleway, cycleway, pedestrian precincts) would only ever end
up rated NEUTRAL and would otherwise roughly double the segment count for no
benefit to what this table exists to answer.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import osmium
from psycopg import Connection

from roadsafe_ingestor.db import retry_on_serialization_conflict
from roadsafe_ingestor.logging_config import get_logger, log_extra

logger = get_logger(__name__)

VEHICLE_HIGHWAY_CLASSES = frozenset(
    {
        "motorway",
        "motorway_link",
        "trunk",
        "trunk_link",
        "primary",
        "primary_link",
        "secondary",
        "secondary_link",
        "tertiary",
        "tertiary_link",
        "unclassified",
        "residential",
        "living_street",
        "service",
        "track",
        "road",
    }
)

BATCH_SIZE = 500

_UPSERT_SQL = """
INSERT INTO road_segments (id, osm_way_id, name, road_class, geometry)
VALUES (%s, %s, %s, %s, ST_SetSRID(%s::GEOMETRY, 4326))
ON CONFLICT (osm_way_id) DO UPDATE SET
    name = EXCLUDED.name,
    road_class = EXCLUDED.road_class,
    geometry = EXCLUDED.geometry,
    calculated_at = now()
"""


class _RoadWayHandler(osmium.SimpleHandler):
    def __init__(self, conn: Connection) -> None:
        super().__init__()
        self._conn = conn
        self._wkb_factory = osmium.geom.WKBFactory()
        self._batch: list[tuple[str, int, str | None, str, str]] = []
        self.ways_seen = 0
        self.ways_inserted = 0
        self.ways_rejected = 0

    def way(self, w: osmium.osm.Way) -> None:
        highway = w.tags.get("highway")
        if highway not in VEHICLE_HIGHWAY_CLASSES:
            return

        self.ways_seen += 1
        try:
            wkb_hex = self._wkb_factory.create_linestring(w)
        except (RuntimeError, osmium.InvalidLocationError) as exc:
            # A way with fewer than two resolvable node locations (missing
            # node in the extract, or a single-point degenerate way) can't
            # become a LineString. Rare, and not worth aborting the whole
            # import over.
            self.ways_rejected += 1
            log_extra(logger, 30, "road way rejected", osm_way_id=w.id, reason=str(exc))
            return

        self._batch.append((str(uuid.uuid4()), w.id, w.tags.get("name"), highway, wkb_hex))
        if len(self._batch) >= BATCH_SIZE:
            self._flush()

    def finish(self) -> None:
        self._flush()

    @retry_on_serialization_conflict
    def _flush(self) -> None:
        if not self._batch:
            return
        with self._conn.cursor() as cur:
            cur.executemany(_UPSERT_SQL, self._batch)
        self._conn.commit()
        self.ways_inserted += len(self._batch)
        log_extra(logger, 20, "road segment batch upserted", count=len(self._batch))
        self._batch = []


def import_road_network(conn: Connection, pbf_path: Path) -> tuple[int, int]:
    """Parses `pbf_path` and upserts every vehicle-carrying way into
    road_segments. Returns (ways_inserted, ways_rejected)."""
    handler = _RoadWayHandler(conn)
    handler.apply_file(str(pbf_path), locations=True, idx="flex_mem")
    handler.finish()
    log_extra(
        logger,
        20,
        "road network import complete",
        ways_seen=handler.ways_seen,
        ways_inserted=handler.ways_inserted,
        ways_rejected=handler.ways_rejected,
    )
    return handler.ways_inserted, handler.ways_rejected
