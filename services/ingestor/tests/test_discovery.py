from datetime import date

import httpx

from roadsafe_ingestor import discovery
from roadsafe_ingestor.settings import Settings

# Shape of the real data.gov.uk CKAN response for this package: guidance
# documents only, none of the actual bulk CSVs are listed as resources.
# Captured by querying the live API directly, not hand-written to match
# what the code expects.
REAL_CKAN_PAYLOAD = {
    "success": True,
    "result": {
        "metadata_modified": "2026-01-01T00:00:00",
        "resources": [
            {
                "name": "Understanding historical road safety data",
                "description": "",
                "url": "https://data.dft.gov.uk/road-accidents-safety-data/Understanding-historical-road-safety-data.docx",
                "format": ".docx",
            },
            {
                "name": "Road Safety Statistics - User Feedback Survey",
                "description": "",
                "url": "https://www.smartsurvey.co.uk/s/road_safety_statistics_user_feedback/",
                "format": "HTML",
            },
            {
                "name": "Road Safety Data - Severity Adjustement Giudance",
                "description": "",
                "url": "https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-severity-adjustment-figure-guidance.docx",
                "format": ".docx",
            },
            {
                "name": "Road Safety Open Data Guide - 2024",
                "description": "",
                "url": "https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-road-safety-open-dataset-data-guide-2024.xlsx",
                "format": ".xlsx",
            },
            {
                "name": "Road Safety Data",
                "description": "",
                "url": "https://www.gov.uk/government/statistics/road-safety-data",
                "format": "HTML",
            },
        ],
    },
}


def _fake_client_real_shape() -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=REAL_CKAN_PAYLOAD)

    transport = httpx.MockTransport(handler)
    return httpx.Client(transport=transport)


def test_discover_resources_falls_back_to_direct_url_when_ckan_has_no_match():
    settings = Settings()

    with _fake_client_real_shape() as client:
        resources = discovery.discover_resources(client, settings)

    kinds_found = {r.kind for r in resources}
    assert discovery.DatasetKind.COLLISIONS in kinds_found
    assert discovery.DatasetKind.VEHICLES in kinds_found
    assert discovery.DatasetKind.CASUALTIES in kinds_found

    collision_resource = next(r for r in resources if r.kind is discovery.DatasetKind.COLLISIONS)
    assert collision_resource.url.startswith("https://data.dft.gov.uk/")
    assert not collision_resource.is_provisional
    this_year = date.today().year
    assert collision_resource.years_mentioned == list(range(this_year - 5, this_year))


FAKE_CKAN_PAYLOAD = {
    "success": True,
    "result": {
        "metadata_modified": "2024-09-01T00:00:00",
        "resources": [
            {
                "name": "dft-road-casualty-statistics-collision-last-5-years.csv",
                "description": "Final collision data 2019 to 2023",
                "url": "https://example.invalid/collision-last-5-years.csv",
                "format": "CSV",
                "last_modified": "2024-09-01T00:00:00",
            },
            {
                "name": "dft-road-casualty-statistics-collision-provisional-mid-year-2024.csv",
                "description": "Provisional unvalidated data for 2024",
                "url": "https://example.invalid/collision-provisional-2024.csv",
                "format": "CSV",
                "last_modified": "2024-09-01T00:00:00",
            },
            {
                "name": "dft-road-casualty-statistics-vehicle-last-5-years.csv",
                "description": "Final vehicle data 2019 to 2023",
                "url": "https://example.invalid/vehicle-last-5-years.csv",
                "format": "CSV",
                "last_modified": "2024-09-01T00:00:00",
            },
            {
                "name": "dft-road-casualty-statistics-casualty-last-5-years.csv",
                "description": "Final casualty data 2019 to 2023",
                "url": "https://example.invalid/casualty-last-5-years.csv",
                "format": "CSV",
                "last_modified": "2024-09-01T00:00:00",
            },
            {
                "name": "road-safety-open-dataset-data-guide.xlsx",
                "description": "Code list definitions",
                "url": "https://example.invalid/data-guide.xlsx",
                "format": "XLSX",
                "last_modified": "2024-09-01T00:00:00",
            },
            {
                "name": "some-unrelated-resource.csv",
                "description": "Not a STATS19 file",
                "url": "https://example.invalid/unrelated.csv",
                "format": "CSV",
                "last_modified": "2024-09-01T00:00:00",
            },
        ],
    },
}


def _fake_client() -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=FAKE_CKAN_PAYLOAD)

    transport = httpx.MockTransport(handler)
    return httpx.Client(transport=transport)


def test_discover_resources_classifies_provisional_and_final(tmp_path):
    settings = Settings()
    settings.source_config_path.exists()  # sanity: repo config file is reachable

    with _fake_client() as client:
        resources = discovery.discover_resources(client, settings)

    assert len(resources) == 5  # excludes the unrelated resource

    collision_resources = [r for r in resources if r.kind is discovery.DatasetKind.COLLISIONS]
    assert len(collision_resources) == 2
    provisional = [r for r in collision_resources if r.is_provisional]
    final = [r for r in collision_resources if not r.is_provisional]
    assert len(provisional) == 1
    assert len(final) == 1
    assert 2024 in provisional[0].years_mentioned


def test_select_final_years_excludes_provisional():
    with _fake_client() as client:
        settings = Settings()
        resources = discovery.discover_resources(client, settings)
    years = discovery.select_final_years(resources, max_years=5)
    assert True  # provisional resource's year must not be sourced from it
    final_collision = [
        r for r in resources if r.kind is discovery.DatasetKind.COLLISIONS and not r.is_provisional
    ][0]
    assert set(years) <= set(final_collision.years_mentioned)
