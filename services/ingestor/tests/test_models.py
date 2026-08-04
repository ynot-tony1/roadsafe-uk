from pathlib import Path

from roadsafe_ingestor.importers.base import stream_csv_rows
from roadsafe_ingestor.models import CasualtyRow, CollisionRow, RowRejectedError, VehicleRow

FIXTURES = Path(__file__).parent / "fixtures"


def test_collision_row_parses_valid_row():
    rows = list(stream_csv_rows(FIXTURES / "collisions_sample.csv"))
    parsed = CollisionRow.from_raw_row(rows[0])
    assert parsed.collision_index == "2023010000001"
    assert parsed.severity_code == 3
    assert parsed.coordinates is not None
    assert parsed.local_authority_district_code == "E09000001"


def test_collision_row_rejects_missing_required_fields():
    rows = list(stream_csv_rows(FIXTURES / "collisions_sample.csv"))
    # Row 4 (index 3) has blank police_force, which is required.
    try:
        CollisionRow.from_raw_row(rows[3])
        raised = False
    except RowRejectedError:
        raised = True
    assert raised


def test_collision_row_handles_missing_coordinates_gracefully():
    rows = list(stream_csv_rows(FIXTURES / "collisions_sample.csv"))
    row = dict(rows[0])
    row["longitude"] = ""
    row["latitude"] = ""
    row["location_easting_osgr"] = ""
    row["location_northing_osgr"] = ""
    parsed = CollisionRow.from_raw_row(row)
    assert parsed.coordinates is None


def test_vehicle_row_parses_valid_row():
    rows = list(stream_csv_rows(FIXTURES / "vehicles_sample.csv"))
    parsed = VehicleRow.from_raw_row(rows[0])
    assert parsed.collision_index == "2023010000001"
    assert parsed.vehicle_reference == 1
    assert parsed.vehicle_type_code == 9


def test_casualty_row_parses_valid_row():
    rows = list(stream_csv_rows(FIXTURES / "casualties_sample.csv"))
    parsed = CasualtyRow.from_raw_row(rows[0])
    assert parsed.collision_index == "2023010000001"
    assert parsed.casualty_severity_code == 3
    assert parsed.casualty_type_code == 9
