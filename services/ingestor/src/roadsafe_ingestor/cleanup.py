"""Removes downloaded source files after a run so the GitHub Actions runner
disk does not accumulate multi-gigabyte CSVs across scheduled runs."""

from __future__ import annotations

import shutil
from pathlib import Path

from roadsafe_ingestor.logging_config import get_logger, log_extra

logger = get_logger(__name__)


def cleanup_downloads(data_dir: Path) -> int:
    if not data_dir.exists():
        return 0
    removed = 0
    for child in data_dir.iterdir():
        if child.is_file():
            child.unlink()
            removed += 1
        elif child.is_dir():
            shutil.rmtree(child)
            removed += 1
    log_extra(logger, 20, "cleanup complete", files_removed=removed, data_dir=str(data_dir))
    return removed
