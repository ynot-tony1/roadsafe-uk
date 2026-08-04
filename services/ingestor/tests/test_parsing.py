from datetime import date

from roadsafe_ingestor import parsing


def test_parse_nullable_int_handles_missing_sentinels():
    assert parsing.parse_nullable_int("") is None
    assert parsing.parse_nullable_int("-1") is None
    assert parsing.parse_nullable_int(None) is None
    assert parsing.parse_nullable_int("NA") is None


def test_parse_nullable_int_parses_valid_values():
    assert parsing.parse_nullable_int("42") == 42
    assert parsing.parse_nullable_int("42.0") == 42
    assert parsing.parse_nullable_int(7) == 7


def test_parse_required_int_raises_on_missing():
    import pytest

    with pytest.raises(ValueError):
        parsing.parse_required_int("", field_name="severity")


def test_parse_date_accepts_dft_format():
    assert parsing.parse_date("15/03/2023") == date(2023, 3, 15)


def test_parse_date_returns_none_for_garbage():
    assert parsing.parse_date("not-a-date") is None
    assert parsing.parse_date("") is None


def test_parse_time_normalises_format():
    assert parsing.parse_time("08:15") == "08:15"
    assert parsing.parse_time("0815") == "08:15"


def test_parse_time_returns_none_when_missing():
    assert parsing.parse_time("") is None
    assert parsing.parse_time(None) is None


def test_parse_bool_flag():
    assert parsing.parse_bool_flag("1") is True
    assert parsing.parse_bool_flag("0") is False
    assert parsing.parse_bool_flag("") is None
