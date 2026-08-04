import pytest

from roadsafe_ingestor.coordinates import (
    InvalidCoordinatesError,
    coordinates_in_gb_envelope,
    from_osgr,
    resolve_coordinates,
    validate_wgs84,
)


def test_coordinates_in_gb_envelope_true_for_london():
    assert coordinates_in_gb_envelope(-0.1276, 51.5074) is True


def test_coordinates_in_gb_envelope_false_for_new_york():
    assert coordinates_in_gb_envelope(-74.0060, 40.7128) is False


def test_from_osgr_converts_trafalgar_square():
    # OSGR for approximately Trafalgar Square, London.
    coords = from_osgr(530000, 180000)
    assert -0.2 < coords.longitude < 0.0
    assert 51.4 < coords.latitude < 51.6


def test_from_osgr_rejects_out_of_envelope():
    with pytest.raises(InvalidCoordinatesError):
        from_osgr(9_999_999, 9_999_999)


def test_validate_wgs84_rejects_outside_gb():
    with pytest.raises(InvalidCoordinatesError):
        validate_wgs84(-74.0060, 40.7128)


def test_resolve_coordinates_prefers_wgs84_when_present():
    result = resolve_coordinates(longitude=-0.1276, latitude=51.5074, easting=None, northing=None)
    assert result is not None
    assert result.longitude == pytest.approx(-0.1276)


def test_resolve_coordinates_falls_back_to_osgr():
    result = resolve_coordinates(longitude=None, latitude=None, easting=530000, northing=180000)
    assert result is not None


def test_resolve_coordinates_returns_none_when_nothing_usable():
    result = resolve_coordinates(longitude=None, latitude=None, easting=None, northing=None)
    assert result is None
