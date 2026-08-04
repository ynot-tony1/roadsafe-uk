from pathlib import Path

from roadsafe_ingestor.importers.base import stream_parsed_batches
from roadsafe_ingestor.models import CollisionRow

FIXTURES = Path(__file__).parent / "fixtures"


def test_stream_parsed_batches_counts_seen_and_rejected():
    batches = list(
        stream_parsed_batches(
            FIXTURES / "collisions_sample.csv", CollisionRow.from_raw_row, batch_size=2
        )
    )
    final_result = batches[-1][1]
    # 5 rows in the fixture, one (row 4) is missing a required field.
    assert final_result.rows_seen == 5
    assert final_result.rows_rejected == 1
    assert len(final_result.rejections) == 1


def test_stream_parsed_batches_respects_batch_size():
    batches = list(
        stream_parsed_batches(
            FIXTURES / "collisions_sample.csv", CollisionRow.from_raw_row, batch_size=2
        )
    )
    batch_sizes = [len(batch) for batch, _ in batches]
    # 4 valid rows out of 5 (1 rejected), batched at size 2: [2, 2], plus a
    # final empty batch that still carries the fully-accumulated result
    # (rows_seen/rejected), which callers rely on even when nothing is
    # left to flush to the database.
    assert batch_sizes == [2, 2, 0]


def test_stream_parsed_batches_yields_final_result_when_trailing_rows_all_rejected(tmp_path):
    # Every row after the header fails to parse: batch never reaches
    # batch_size and the loop ends with an empty batch. The final
    # (batch, result) pair must still be yielded, or a caller's
    # incrementally-updated `final_result` never advances past its
    # zeroed default.
    # A single blank line is skipped entirely by csv.DictReader rather than
    # read as a row of empty fields, so each row needs a real field
    # separator to actually be seen and then rejected.
    csv_path = tmp_path / "all_rejected.csv"
    csv_path.write_text("collision_index,other\n,foo\n,bar\n")

    batches = list(stream_parsed_batches(csv_path, CollisionRow.from_raw_row, batch_size=500))

    assert len(batches) == 1
    batch, result = batches[0]
    assert batch == []
    assert result.rows_seen == 2
    assert result.rows_rejected == 2
