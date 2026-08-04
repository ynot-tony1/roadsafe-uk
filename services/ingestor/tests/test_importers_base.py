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
    # 4 valid rows out of 5 (1 rejected), batched at size 2: [2, 2].
    assert batch_sizes == [2, 2]
