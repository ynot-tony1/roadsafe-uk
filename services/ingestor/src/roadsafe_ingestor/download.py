"""Downloads discovered resources to the local data directory, streaming to
disk and recording a sha256 checksum for each file (spec section 11)."""

from __future__ import annotations

from pathlib import Path

import httpx

from roadsafe_ingestor.discovery import DiscoveredResource
from roadsafe_ingestor.http_client import download_to
from roadsafe_ingestor.logging_config import get_logger, log_extra

logger = get_logger(__name__)


def download_resource(
    client: httpx.Client, resource: DiscoveredResource, data_dir: Path
) -> tuple[Path, str]:
    suffix = Path(resource.url).suffix or ".csv"
    destination = data_dir / f"{resource.kind.value}{suffix}"
    checksum = download_to(client, resource.url, destination)
    log_extra(
        logger,
        20,
        "downloaded resource",
        kind=resource.kind.value,
        destination=str(destination),
        checksum=checksum,
    )
    return destination, checksum
