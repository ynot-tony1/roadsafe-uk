"""Coordinate parsing and validation.

STATS19 collision records carry both OSGR easting/northing and, in current
releases, WGS84 longitude/latitude directly. This module validates whatever
is present and derives longitude/latitude from OSGR when only the grid
reference is available, so older file formats remain importable.
"""

from __future__ import annotations

from dataclasses import dataclass

from pyproj import Transformer

# Great Britain's approximate WGS84 envelope. Anything outside this is
# rejected rather than silently stored, since it cannot be a real STATS19
# collision location.
GB_LAT_RANGE = (49.5, 61.1)
GB_LNG_RANGE = (-8.7, 2.1)

_osgr_to_wgs84 = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)


@dataclass(frozen=True)
class Coordinates:
    longitude: float
    latitude: float


class InvalidCoordinatesError(ValueError):
    pass


def coordinates_in_gb_envelope(longitude: float, latitude: float) -> bool:
    return (
        GB_LNG_RANGE[0] <= longitude <= GB_LNG_RANGE[1]
        and GB_LAT_RANGE[0] <= latitude <= GB_LAT_RANGE[1]
    )


def from_osgr(easting: int, northing: int) -> Coordinates:
    """Convert an OSGB36 National Grid reference to WGS84 longitude/latitude."""
    longitude, latitude = _osgr_to_wgs84.transform(easting, northing)
    if not coordinates_in_gb_envelope(longitude, latitude):
        raise InvalidCoordinatesError(
            f"OSGR ({easting}, {northing}) converts outside the Great Britain envelope"
        )
    return Coordinates(longitude=longitude, latitude=latitude)


def validate_wgs84(longitude: float, latitude: float) -> Coordinates:
    if not coordinates_in_gb_envelope(longitude, latitude):
        raise InvalidCoordinatesError(
            f"Coordinates ({longitude}, {latitude}) fall outside the Great Britain envelope"
        )
    return Coordinates(longitude=longitude, latitude=latitude)


def resolve_coordinates(
    *,
    longitude: float | None,
    latitude: float | None,
    easting: int | None,
    northing: int | None,
) -> Coordinates | None:
    """Best-effort coordinate resolution. Returns None rather than raising
    when a collision record legitimately has no usable location, that
    still happens in a small fraction of STATS19 rows and must not abort
    the whole import."""
    if longitude is not None and latitude is not None:
        try:
            return validate_wgs84(longitude, latitude)
        except InvalidCoordinatesError:
            pass
    if easting is not None and northing is not None and easting > 0 and northing > 0:
        try:
            return from_osgr(easting, northing)
        except InvalidCoordinatesError:
            pass
    return None
