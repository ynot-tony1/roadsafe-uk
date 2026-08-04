"""Shared HTTPX client with retry for source discovery and downloads."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, cast

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from roadsafe_ingestor.logging_config import get_logger

logger = get_logger(__name__)

DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
USER_AGENT = "roadsafe-uk-ingestor/0.1 (+https://github.com/roadsafe-uk)"


def build_client() -> httpx.Client:
    return httpx.Client(
        timeout=DEFAULT_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    )


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, max=20))
def get_json(client: httpx.Client, url: str) -> dict[str, Any]:
    response = client.get(url)
    response.raise_for_status()
    return cast(dict[str, Any], response.json())


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, max=20))
def download_to(client: httpx.Client, url: str, destination: Path) -> str:
    """Stream a URL to disk and return its sha256 checksum. Never loads the
    full response body into memory at once."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with client.stream("GET", url) as response:
        response.raise_for_status()
        with destination.open("wb") as f:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)
                digest.update(chunk)
    return digest.hexdigest()
