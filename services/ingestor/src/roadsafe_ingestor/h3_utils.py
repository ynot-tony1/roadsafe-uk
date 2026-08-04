"""H3 index calculation for map aggregation (spec section 9)."""

from __future__ import annotations

import h3

H3_RESOLUTIONS: tuple[int, int, int] = (5, 7, 9)


def h3_indexes_for_point(longitude: float, latitude: float) -> dict[int, str]:
    """Compute the H3 cell index at every resolution the map layer strategy needs."""
    return {
        resolution: h3.latlng_to_cell(latitude, longitude, resolution)
        for resolution in H3_RESOLUTIONS
    }
