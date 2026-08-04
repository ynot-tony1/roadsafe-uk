"""Creates and updates IngestionRun rows so every pipeline execution is
auditable from the /status page and docs/operations.md runbooks."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from psycopg import Connection


@dataclass
class RunHandle:
    id: str


def start_run(
    conn: Connection,
    *,
    source_year: int,
    source_status: str,
    source_revision: str,
    source_checksum: str,
    workflow_run_id: str | None,
    git_sha: str | None,
) -> RunHandle:
    run_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ingestion_runs (
                id, source_year, source_status, source_revision, source_checksum,
                status, started_at, workflow_run_id, git_sha
            ) VALUES (%s, %s, %s, %s, %s, 'RUNNING', now(), %s, %s)
            """,
            (
                run_id,
                source_year,
                source_status,
                source_revision,
                source_checksum,
                workflow_run_id,
                git_sha,
            ),
        )
    conn.commit()
    return RunHandle(id=run_id)


def complete_run(
    conn: Connection,
    run: RunHandle,
    *,
    status: str,
    collisions_seen: int = 0,
    vehicles_seen: int = 0,
    casualties_seen: int = 0,
    rows_inserted: int = 0,
    rows_updated: int = 0,
    rows_rejected: int = 0,
    aggregates_created: int = 0,
    error_summary: str | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE ingestion_runs SET
                status = %s, completed_at = now(),
                collisions_seen = %s, vehicles_seen = %s, casualties_seen = %s,
                rows_inserted = %s, rows_updated = %s, rows_rejected = %s,
                aggregates_created = %s, error_summary = %s
            WHERE id = %s
            """,
            (
                status,
                collisions_seen,
                vehicles_seen,
                casualties_seen,
                rows_inserted,
                rows_updated,
                rows_rejected,
                aggregates_created,
                error_summary,
                run.id,
            ),
        )
    conn.commit()
