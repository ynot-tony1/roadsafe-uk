"""Database access helpers.

All writes go through batched `executemany`-style calls, never one
statement per row, and retry on CockroachDB serialization conflicts
(SQLSTATE 40001) with exponential backoff via tenacity.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator, Sequence
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg import Connection
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from roadsafe_ingestor.logging_config import get_logger

logger = get_logger(__name__)

BATCH_SIZE = 500


def _is_serialization_conflict(exc: BaseException) -> bool:
    return isinstance(exc, psycopg.errors.SerializationFailure)


# Shared by every function in this codebase that executes then commits a
# write transaction, not just execute_batch_upsert: CockroachDB's
# SERIALIZABLE isolation means a conflicting concurrent transaction (for
# example two years' worth of aggregate-building running in parallel, both
# touching overlapping key ranges) is a routine, expected outcome under
# contention, not a bug, and the whole transaction must be retried from its
# first statement, a bare retry on commit() alone would not re-run the
# writes that preceded it.
retry_on_serialization_conflict = retry(
    retry=retry_if_exception(_is_serialization_conflict),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=0.5, max=8),
    reraise=True,
)


@contextmanager
def connect(database_url: str) -> Iterator[Connection]:
    # A long-running import twice hung for 50+ minutes with no active query
    # visible on the cluster (confirmed via SHOW CLUSTER QUERIES) and no
    # data growth on a second attempt even after adding TCP keepalives
    # below. CockroachDB Cloud terminates client connections at a SQL proxy
    # in front of the actual nodes; if the proxy loses track of the backend
    # but keeps the client-facing TCP socket answering, keepalives never
    # see a problem because that hop of the connection is genuinely still
    # alive. statement_timeout is enforced by the database itself, so it
    # still returns a clean, retryable error even when the failure is on
    # the proxy-to-backend hop, not the client-to-proxy one that keepalives
    # can see.
    with psycopg.connect(
        database_url,
        autocommit=False,
        connect_timeout=10,
        keepalives=1,
        keepalives_idle=20,
        keepalives_interval=10,
        keepalives_count=3,
        options="-c statement_timeout=120000",
    ) as conn:
        yield conn


@retry_on_serialization_conflict
def execute_batch_upsert(
    conn: Connection,
    *,
    table: str,
    columns: Sequence[str],
    conflict_columns: Sequence[str],
    update_columns: Sequence[str],
    rows: Sequence[tuple[Any, ...]],
) -> int:
    """Upsert `rows` into `table` in batches, retrying on serialization
    conflicts. Returns the number of rows affected. `columns`, the tuple
    order in `rows`, and `conflict_columns`/`update_columns` must agree."""
    if not rows:
        return 0

    column_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    conflict_list = ", ".join(conflict_columns)
    set_clause = ", ".join(f"{col} = EXCLUDED.{col}" for col in update_columns)

    sql = (
        f"INSERT INTO {table} ({column_list}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict_list}) DO UPDATE SET {set_clause}"
    )

    affected = 0
    with conn.cursor() as cur:
        for batch in _chunk(rows, BATCH_SIZE):
            cur.executemany(sql, batch)
            affected += (
                cur.rowcount if cur.rowcount is not None and cur.rowcount > 0 else len(batch)
            )
    conn.commit()
    return affected


def _chunk(items: Sequence[Any], size: int) -> Iterable[Sequence[Any]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def execute_batch_upsert_with_fk_fallback(
    conn: Connection,
    *,
    table: str,
    columns: Sequence[str],
    conflict_columns: Sequence[str],
    update_columns: Sequence[str],
    rows: Sequence[tuple[Any, ...]],
    row_reference: Sequence[Any],
) -> tuple[int, list[tuple[Any, str]]]:
    """Like execute_batch_upsert, but when a batch fails a foreign key
    check (for example a vehicle referencing a collision that was rejected
    upstream), retries the batch one row at a time so the valid rows still
    land and only the offending rows are reported as rejected. Returns
    (rows_inserted, [(reference, reason), ...])."""
    try:
        inserted = execute_batch_upsert(
            conn,
            table=table,
            columns=columns,
            conflict_columns=conflict_columns,
            update_columns=update_columns,
            rows=rows,
        )
        return inserted, []
    except psycopg.errors.ForeignKeyViolation:
        conn.rollback()

    rejected: list[tuple[Any, str]] = []
    inserted = 0
    column_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    conflict_list = ", ".join(conflict_columns)
    set_clause = ", ".join(f"{col} = EXCLUDED.{col}" for col in update_columns)
    sql = (
        f"INSERT INTO {table} ({column_list}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict_list}) DO UPDATE SET {set_clause}"
    )
    with conn.cursor() as cur:
        for row, reference in zip(rows, row_reference, strict=True):
            try:
                cur.execute(sql, row)
                inserted += 1
                conn.commit()
            except psycopg.errors.ForeignKeyViolation:
                conn.rollback()
                rejected.append((reference, "references a collision that was not imported"))
    return inserted, rejected
