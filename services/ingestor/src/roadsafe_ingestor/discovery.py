"""Source discovery.

Finds the currently published DfT STATS19 dataset files by querying the
data.gov.uk CKAN API rather than hardcoding a specific year's URL, since
those URLs and filenames change with every publication. See
config/source-config.yml for the stable catalog entry point and
docs/data-sources.md for how classification works.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Any, cast

import httpx
import yaml

from roadsafe_ingestor.http_client import get_json
from roadsafe_ingestor.logging_config import get_logger
from roadsafe_ingestor.settings import Settings

logger = get_logger(__name__)

_PROVISIONAL_PATTERN = re.compile(r"provisional|mid[- ]year|unvalidated", re.IGNORECASE)
_YEAR_PATTERN = re.compile(r"(19|20)\d{2}")


class DatasetKind(str, Enum):
    COLLISIONS = "collisions"
    VEHICLES = "vehicles"
    CASUALTIES = "casualties"
    CODE_LIST = "code_list"


@dataclass(frozen=True)
class DiscoveredResource:
    kind: DatasetKind
    name: str
    url: str
    format: str
    is_provisional: bool
    years_mentioned: list[int]
    last_modified: str | None
    revision: str


def load_source_config(settings: Settings) -> dict[str, Any]:
    with settings.source_config_path.open() as f:
        return cast(dict[str, Any], yaml.safe_load(f))


def _classify(resource_name: str, description: str) -> bool:
    haystack = f"{resource_name} {description}"
    return bool(_PROVISIONAL_PATTERN.search(haystack))


def _years_in(text: str) -> list[int]:
    return sorted({int(match.group(0)) for match in _YEAR_PATTERN.finditer(text)})


def discover_resources(client: httpx.Client, settings: Settings) -> list[DiscoveredResource]:
    config = load_source_config(settings)
    dft = config["dft_road_safety"]
    payload = get_json(client, dft["ckan_api_url"])

    if not payload.get("success"):
        raise RuntimeError("CKAN package_show call did not report success")

    result = payload["result"]
    resources = result.get("resources", [])
    revision = str(result.get("metadata_modified") or result.get("revision_id") or "unknown")

    patterns = {
        DatasetKind.COLLISIONS: dft["datasets"]["collisions"]["resource_name_pattern"],
        DatasetKind.VEHICLES: dft["datasets"]["vehicles"]["resource_name_pattern"],
        DatasetKind.CASUALTIES: dft["datasets"]["casualties"]["resource_name_pattern"],
        DatasetKind.CODE_LIST: dft["code_lists"]["resource_name_pattern"],
    }

    discovered: list[DiscoveredResource] = []
    for resource in resources:
        name = resource.get("name", "")
        description = resource.get("description", "")
        url = resource.get("url", "")
        fmt = (resource.get("format") or "").upper()
        for kind, pattern in patterns.items():
            if pattern.lower() in name.lower():
                discovered.append(
                    DiscoveredResource(
                        kind=kind,
                        name=name,
                        url=url,
                        format=fmt,
                        is_provisional=_classify(name, description),
                        years_mentioned=_years_in(f"{name} {description}"),
                        last_modified=resource.get("last_modified"),
                        revision=revision,
                    )
                )
                break

    # The live CKAN package for this dataset does not list the bulk CSVs
    # as resources at all, only guidance documents (confirmed against the
    # real API, not assumed). Fall back to each dataset's configured
    # direct_url when nothing in CKAN's resource list matched.
    found_kinds = {r.kind for r in discovered}
    for kind in (DatasetKind.COLLISIONS, DatasetKind.VEHICLES, DatasetKind.CASUALTIES):
        if kind in found_kinds:
            continue
        dataset_config = dft["datasets"].get(kind.value, {})
        direct_url = dataset_config.get("direct_url")
        if not direct_url:
            continue
        discovered.append(_fallback_resource(kind, direct_url, revision))

    logger.info("discovered %d matching resources of %d total", len(discovered), len(resources))
    return discovered


def _fallback_resource(kind: DatasetKind, url: str, revision: str) -> DiscoveredResource:
    """Builds a DiscoveredResource for a dataset kind CKAN doesn't list.

    The direct_url files are always named "*-last-5-years.csv", a rolling
    window of the 5 most recently completed calendar years (verified
    against the live file: on 2026-08-04 it contained exactly 2021 to
    2025). There's no per-year resource to inspect for a year list, so
    this is computed from today's date rather than parsed from anything.
    """
    today = date.today()
    years = list(range(today.year - 5, today.year))
    return DiscoveredResource(
        kind=kind,
        name=url.rsplit("/", 1)[-1],
        url=url,
        format="CSV",
        is_provisional=False,
        years_mentioned=years,
        last_modified=None,
        revision=revision,
    )


def select_final_years(resources: list[DiscoveredResource], *, max_years: int) -> list[int]:
    """From discovered collision resources, work out which years are
    available as final (non-provisional) data, most recent first, capped
    at max_years."""
    years: set[int] = set()
    for resource in resources:
        if resource.kind is DatasetKind.COLLISIONS and not resource.is_provisional:
            years.update(resource.years_mentioned)
    return sorted(years, reverse=True)[:max_years]
