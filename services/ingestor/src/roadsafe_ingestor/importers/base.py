"""Shared streaming CSV import machinery.

Reads one row at a time with csv.DictReader and flushes to the database in
fixed-size batches, so a five-year, multi-gigabyte file is never fully
materialised in memory, only one batch at a time. Rejects are counted and
logged with only their reference and rejection reason, never the raw row
content.
"""

from __future__ import annotations

import csv
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import TypeVar

from roadsafe_ingestor.logging_config import get_logger
from roadsafe_ingestor.models import RowRejectedError

logger = get_logger(__name__)

T = TypeVar("T")

DEFAULT_BATCH_SIZE = 500


@dataclass
class ImportResult:
    rows_seen: int = 0
    rows_inserted: int = 0
    rows_rejected: int = 0
    rejections: list[tuple[str, str]] = field(default_factory=list)


def stream_csv_rows(path: Path) -> Iterator[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)


def stream_parsed_batches(
    path: Path,
    parser: Callable[[dict[str, str]], T],
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    max_rejection_samples: int = 50,
) -> Iterator[tuple[list[T], ImportResult]]:
    """Yields (batch, running_result) pairs. `running_result` accumulates
    across the whole file so the caller can log a final summary after the
    last batch without holding every parsed row at once."""
    result = ImportResult()
    batch: list[T] = []
    for raw_row in stream_csv_rows(path):
        result.rows_seen += 1
        try:
            batch.append(parser(raw_row))
        except RowRejectedError as exc:
            result.rows_rejected += 1
            if len(result.rejections) < max_rejection_samples:
                result.rejections.append((exc.reference, exc.reason))
        except Exception as exc:  # noqa: BLE001 - malformed row must not abort the run
            result.rows_rejected += 1
            if len(result.rejections) < max_rejection_samples:
                result.rejections.append(("<unknown>", f"unexpected error: {exc}"))

        if len(batch) >= batch_size:
            yield batch, result
            batch = []

    # Yield the final state even when every row in the trailing partial
    # batch was rejected (batch empty but result.rows_seen > 0), otherwise
    # the caller's `final_result` never updates past its zeroed default and
    # the whole file's rows_seen/rejections silently vanish.
    if batch or result.rows_seen:
        yield batch, result
