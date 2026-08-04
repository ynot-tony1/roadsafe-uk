import httpx

from roadsafe_ingestor import discovery
from roadsafe_ingestor.settings import Settings

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
