"""Typer CLI entry point. See docs/ingestion.md for a walkthrough of each
command and how the ingest-road-safety.yml GitHub Actions workflow drives
them."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Annotated

import typer

from roadsafe_ingestor import cleanup as cleanup_module
from roadsafe_ingestor import db
from roadsafe_ingestor import discovery as discovery_module
from roadsafe_ingestor import download as download_module
from roadsafe_ingestor import verify as verify_module
from roadsafe_ingestor.aggregates import annual_metrics, h3_metrics
from roadsafe_ingestor.http_client import build_client
from roadsafe_ingestor.importers import code_lists as code_lists_importer
from roadsafe_ingestor.importers.casualties import import_casualties
from roadsafe_ingestor.importers.collisions import import_collisions
from roadsafe_ingestor.importers.vehicles import import_vehicles
from roadsafe_ingestor.ingestion_run import complete_run, start_run
from roadsafe_ingestor.logging_config import configure_logging, get_logger, log_extra
from roadsafe_ingestor.settings import get_settings

# pretty_exceptions_show_locals defaults to True, which prints every local
# variable on an uncaught exception, including live psycopg.Connection
# objects that hold the plaintext password. A real connection failure did
# exactly this into a public GitHub Actions log; disabled everywhere, not
# just in CI, since a local terminal can be shared or screen-recorded too.
app = typer.Typer(
    help="RoadSafe UK ingestion pipeline",
    pretty_exceptions_show_locals=False,
)
logger = get_logger(__name__)


def _git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:  # noqa: BLE001
        return None


@app.command()
def discover() -> None:
    """Discover currently published DfT dataset files and print a summary."""
    configure_logging()
    settings = get_settings()
    with build_client() as client:
        resources = discovery_module.discover_resources(client, settings)
        final_years = discovery_module.select_final_years(resources, max_years=5)

    for resource in resources:
        typer.echo(
            f"{resource.kind.value:12s} provisional={resource.is_provisional!s:5s} "
            f"years={resource.years_mentioned} {resource.name}"
        )
    typer.echo(f"\nLatest final years available (max 5): {final_years}")


@app.command()
def download(
    data_dir: Annotated[Path, typer.Option(help="Directory to download files into")] = Path(
        "data/raw"
    ),
) -> None:
    """Download the currently discovered resources to disk."""
    configure_logging()
    settings = get_settings()
    with build_client() as client:
        resources = discovery_module.discover_resources(client, settings)
        for resource in resources:
            download_module.download_resource(client, resource, data_dir)


@app.command(name="import-code-lists")
def import_code_lists_cmd() -> None:
    """Load config/stats19-code-lists/code-lists.json into code_definitions."""
    configure_logging()
    settings = get_settings()
    with db.connect(settings.ingest_database_url.get_secret_value()) as conn:
        code_lists_importer.import_code_lists(conn, settings)


@app.command(name="import-collisions")
def import_collisions_cmd(
    csv_path: Path,
    source_status: Annotated[str, typer.Option()] = "FINAL",
    source_revision: Annotated[str, typer.Option()] = "unknown",
) -> None:
    """Stream-import a collision CSV file."""
    configure_logging()
    settings = get_settings()
    with db.connect(settings.ingest_database_url.get_secret_value()) as conn:
        result = import_collisions(
            conn, csv_path, source_status=source_status, source_revision=source_revision
        )
    typer.echo(
        f"seen={result.rows_seen} inserted={result.rows_inserted} rejected={result.rows_rejected}"
    )


@app.command(name="import-vehicles")
def import_vehicles_cmd(csv_path: Path) -> None:
    """Stream-import a vehicle CSV file."""
    configure_logging()
    settings = get_settings()
    with db.connect(settings.ingest_database_url.get_secret_value()) as conn:
        result = import_vehicles(conn, csv_path)
    typer.echo(
        f"seen={result.rows_seen} inserted={result.rows_inserted} rejected={result.rows_rejected}"
    )


@app.command(name="import-casualties")
def import_casualties_cmd(csv_path: Path) -> None:
    """Stream-import a casualty CSV file."""
    configure_logging()
    settings = get_settings()
    with db.connect(settings.ingest_database_url.get_secret_value()) as conn:
        result = import_casualties(conn, csv_path)
    typer.echo(
        f"seen={result.rows_seen} inserted={result.rows_inserted} rejected={result.rows_rejected}"
    )


@app.command(name="build-h3")
def build_h3(
    year: int,
    source_import_id: Annotated[str, typer.Option()] = "manual",
) -> None:
    """Build H3 aggregates for one year across every precomputed resolution."""
    configure_logging()
    settings = get_settings()
    from datetime import date

    period_start = date(year, 1, 1)
    period_end = date(year, 12, 31)
    with db.connect(settings.ingest_database_url.get_secret_value()) as conn:
        for resolution in (5, 7, 9):
            h3_metrics.build_h3_all_dimension(
                conn,
                resolution=resolution,
                period_start=period_start,
                period_end=period_end,
                source_import_id=source_import_id,
            )
            ok = h3_metrics.verify_h3_totals(
                conn, resolution=resolution, period_start=period_start, period_end=period_end
            )
            if not ok:
                typer.echo(
                    f"WARNING: h3 totals did not reconcile at resolution {resolution}", err=True
                )


@app.command(name="refresh-metrics")
def refresh_metrics(
    year: int,
    source_import_id: Annotated[str, typer.Option()] = "manual",
) -> None:
    """Rebuild AnnualMetric rows for one year."""
    configure_logging()
    settings = get_settings()
    with db.connect(settings.ingest_database_url.get_secret_value()) as conn:
        rows = annual_metrics.build_national_annual_metrics(
            conn, year=year, source_import_id=source_import_id
        )
    typer.echo(f"annual metric rows written: {rows}")


@app.command()
def verify(year: int) -> None:
    """Run post-import verification checks for one year and exit non-zero on failure."""
    configure_logging()
    settings = get_settings()
    with db.connect(settings.ingest_database_url.get_secret_value()) as conn:
        checks = verify_module.verify_year(conn, year=year)
    for check in checks:
        status = "PASS" if check.passed else "FAIL"
        typer.echo(f"[{status}] {check.name}: {check.detail}")
    if not verify_module.all_passed(checks):
        raise typer.Exit(code=1)


@app.command()
def cleanup(
    data_dir: Annotated[Path, typer.Option()] = Path("data/raw"),
) -> None:
    """Remove downloaded source files."""
    configure_logging()
    cleanup_module.cleanup_downloads(data_dir)


@app.command()
def run(
    year: int,
    source_status: Annotated[str, typer.Option()] = "FINAL",
    collisions_csv: Annotated[Path | None, typer.Option()] = None,
    vehicles_csv: Annotated[Path | None, typer.Option()] = None,
    casualties_csv: Annotated[Path | None, typer.Option()] = None,
    source_revision: Annotated[str, typer.Option()] = "unknown",
    source_checksum: Annotated[str, typer.Option()] = "unknown",
    workflow_run_id: Annotated[str | None, typer.Option()] = None,
    skip_vehicles: bool = False,
    skip_casualties: bool = False,
    skip_aggregates: bool = False,
    dry_run: bool = False,
) -> None:
    """Full pipeline for one year: import, aggregate, verify. Only marks
    the run as SUCCEEDED once every verification check passes."""
    configure_logging()
    settings = get_settings()

    if dry_run:
        typer.echo(f"dry run: would import year={year} status={source_status}")
        return

    with db.connect(settings.ingest_database_url.get_secret_value()) as conn:
        run_handle = start_run(
            conn,
            source_year=year,
            source_status=source_status,
            source_revision=source_revision,
            source_checksum=source_checksum,
            workflow_run_id=workflow_run_id,
            git_sha=_git_sha(),
        )

        collisions_seen = vehicles_seen = casualties_seen = 0
        rows_inserted = rows_rejected = 0

        try:
            if collisions_csv:
                result = import_collisions(
                    conn,
                    collisions_csv,
                    source_status=source_status,
                    source_revision=source_revision,
                )
                collisions_seen = result.rows_seen
                rows_inserted += result.rows_inserted
                rows_rejected += result.rows_rejected

            if vehicles_csv and not skip_vehicles:
                result = import_vehicles(conn, vehicles_csv)
                vehicles_seen = result.rows_seen
                rows_inserted += result.rows_inserted
                rows_rejected += result.rows_rejected

            if casualties_csv and not skip_casualties:
                result = import_casualties(conn, casualties_csv)
                casualties_seen = result.rows_seen
                rows_inserted += result.rows_inserted
                rows_rejected += result.rows_rejected

            aggregates_created = 0
            if not skip_aggregates:
                from datetime import date

                for resolution in (5, 7, 9):
                    h3_metrics.build_h3_all_dimension(
                        conn,
                        resolution=resolution,
                        period_start=date(year, 1, 1),
                        period_end=date(year, 12, 31),
                        source_import_id=run_handle.id,
                    )
                    aggregates_created += 1
                aggregates_created += annual_metrics.build_national_annual_metrics(
                    conn, year=year, source_import_id=run_handle.id
                )

            checks = verify_module.verify_year(conn, year=year)
            passed = verify_module.all_passed(checks)

            complete_run(
                conn,
                run_handle,
                status="SUCCEEDED" if passed else "PARTIAL",
                collisions_seen=collisions_seen,
                vehicles_seen=vehicles_seen,
                casualties_seen=casualties_seen,
                rows_inserted=rows_inserted,
                rows_rejected=rows_rejected,
                aggregates_created=aggregates_created,
                error_summary=None if passed else "one or more verification checks failed",
            )

            if not passed:
                typer.echo("verification failed, run marked PARTIAL", err=True)
                raise typer.Exit(code=1)

        except Exception as exc:  # noqa: BLE001
            # A failure mid-batch leaves the connection's transaction
            # aborted; CockroachDB refuses every further statement,
            # including this one, until it's rolled back, which would
            # otherwise mask the real error behind an unrelated
            # InFailedSqlTransaction from this exact call.
            conn.rollback()
            complete_run(
                conn,
                run_handle,
                status="FAILED",
                collisions_seen=collisions_seen,
                vehicles_seen=vehicles_seen,
                casualties_seen=casualties_seen,
                rows_inserted=rows_inserted,
                rows_rejected=rows_rejected,
                error_summary=str(exc)[:4000],
            )
            log_extra(logger, 40, "ingestion run failed", error=str(exc))
            raise


if __name__ == "__main__":
    app()
