from roadsafe_ingestor.h3_utils import H3_RESOLUTIONS, h3_indexes_for_point


def test_h3_indexes_for_point_returns_all_configured_resolutions():
    result = h3_indexes_for_point(-0.1276, 51.5074)
    assert set(result.keys()) == set(H3_RESOLUTIONS)
    for cell in result.values():
        assert isinstance(cell, str)
        assert len(cell) > 0


def test_h3_index_is_stable_for_same_point():
    a = h3_indexes_for_point(-0.1276, 51.5074)
    b = h3_indexes_for_point(-0.1276, 51.5074)
    assert a == b


def test_coarser_resolution_covers_more_area_than_finer():
    # Two nearby points should collide at low resolution 5 but may differ at
    # high resolution 9.
    a = h3_indexes_for_point(-0.1276, 51.5074)
    b = h3_indexes_for_point(-0.1277, 51.5075)
    assert a[5] == b[5]
