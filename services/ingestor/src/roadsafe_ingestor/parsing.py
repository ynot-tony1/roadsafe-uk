"""Defensive parsing helpers for raw STATS19 CSV values.

DfT's CSV exports mix genuinely blank cells, the literal string "-1" (their
own missing-data sentinel), and occasional stray whitespace. Every parser
here returns None rather than raising when a value cannot be confidently
interpreted, the caller decides whether that field is required.
"""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime

_MISSING_SENTINELS = {"", "na", "n/a", "null", "-1", "none"}


def parse_nullable_int(value: object) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in _MISSING_SENTINELS:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def parse_required_int(value: object, *, field_name: str) -> int:
    parsed = parse_nullable_int(value)
    if parsed is None:
        raise ValueError(f"{field_name} is required but was missing or unparseable: {value!r}")
    return parsed


def parse_nullable_float(value: object) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in _MISSING_SENTINELS:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_date(value: object) -> date_type | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def parse_time(value: object) -> str | None:
    """Returns a normalised "HH:MM" string, or None if unparseable."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in _MISSING_SENTINELS:
        return None
    for fmt in ("%H:%M", "%H%M"):
        try:
            return datetime.strptime(text, fmt).strftime("%H:%M")
        except ValueError:
            continue
    return None


def parse_bool_flag(value: object) -> bool | None:
    parsed = parse_nullable_int(value)
    if parsed is None:
        return None
    return parsed == 1
