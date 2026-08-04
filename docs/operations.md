# Operations

## GitHub Actions workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push, pull request | Typecheck, lint, test, and build `apps/web`, `packages/database`, `packages/shared`; `pytest`/`ruff`/`mypy` for `services/ingestor`. Required to pass before merge. |
| `check-road-safety-data.yml` | Scheduled (e.g. weekly) | Runs `ingestor discover` only. Opens a GitHub issue when a new DfT publication is found. Does not import anything; new data is always a human decision to act on, not an automatic trigger. |
| `ingest-road-safety.yml` | Manual dispatch, with `year` and `source_status` inputs | Runs the full ingestion pipeline for a given year. Gated by the `INGESTION_ENABLED` repository variable (a hard stop) and `PROVISIONAL_DATA_ENABLED` (whether provisional-status data may be imported at all). Uses the `INGEST_DATABASE_URL` secret. Deliberately not scheduled, ingestion is always triggered after a human reviews the issue `check-road-safety-data.yml` opens, not automatically. |
| `rebuild-aggregates.yml` | Manual dispatch | Reruns `ingestor build-h3` / `refresh-metrics` for a given year without re-importing raw data. Used after a grouping/methodology change in `packages/shared` or the ingestor's aggregate queries. |
| `migrate-production.yml` | Manual dispatch, or on merge to main touching `packages/database/prisma/migrations/**` | Runs `prisma migrate deploy` against production using the `MIGRATION_DATABASE_URL` secret (`roadsafe_migrator`). The only workflow with schema-write access. |

## Monitoring an ingestion run

`/status` reads the `ingestion_runs` table directly and is the first place
to check: it shows every run's year, source status, row counts, and
outcome (`SUCCEEDED`/`PARTIAL`/`FAILED`), revalidated every 5 minutes
(`revalidate = 300`). A `PARTIAL` run means import succeeded but one or
more `ingestor verify` checks failed; a `FAILED` run means an exception
was raised mid-pipeline, with `error_summary` on the row (truncated to
4000 characters) giving the first clue.

## Responding to a failed or partial run

1. Check `/status` (or query `ingestion_runs` directly) for the specific
   run's `error_summary` and which stage it reached
   (`collisions_seen`/`vehicles_seen`/`casualties_seen`, `rows_rejected`,
   `aggregates_created` all being partially populated narrows down where
   it stopped).
2. Check the GitHub Actions run log for `ingest-road-safety.yml`, for the
   full stack trace `error_summary` was truncated from.
3. A `PARTIAL` run (verification failed but import completed) is safe to
   investigate without urgency, the previous data is untouched, this
   year's data is present but flagged. Re-run `ingestor verify <year>`
   locally against production (read-only, using `roadsafe_ingestor`'s
   credential) to reproduce which check failed.
4. A `FAILED` run partway through `import-collisions`/`import-vehicles`/
   `import-casualties` may have partially inserted rows for that source
   file. Because these importers use `collision_index` (and the composite
   vehicle/casualty keys) as natural keys, rerunning the same import is
   expected to be safe rather than duplicating rows, but confirm against
   the specific failure before assuming that.
5. Once fixed, either rerun `ingest-road-safety.yml` for that year via
   manual dispatch, or run `ingestor run <year>` locally against
   production if the fix needs local iteration first.

## Credential handling

The CockroachDB Cloud admin/bootstrap credential is the most sensitive
secret in this project's operation, holding it grants full control over
the cluster, not just the `road_safety` database. It is used exactly once,
during initial cluster bootstrap, to create the database and the three
least-privilege roles, and is never stored beyond that:

- Never printed, logged, echoed, or committed anywhere.
- Referenced only via environment-variable expansion inside a script that
  reads it from a gitignored file, never typed inline in a visible
  command.
- The bootstrap file is truncated to empty immediately after the roles it
  was needed for are created.

Day-to-day operation (ingestion, app queries, migrations) uses only the
three scoped role credentials, never the admin credential. If cluster
administration is ever needed again (adding a role, changing cluster
settings), treat it as a deliberate one-time re-bootstrap, not a
credential to keep on hand.

## Rebuilding aggregates after a methodology change

If `packages/shared`'s road-user grouping, age-band boundaries, or KSI
definition ever changes, historic `h3_metrics`/`annual_metrics` rows
computed under the old definition become stale but are not automatically
invalidated (they don't self-describe which methodology version produced
them beyond `source_import_id`). Run `rebuild-aggregates.yml` for every
affected year after such a change, and update
`services/ingestor/aggregates/annual_metrics.py`'s `_ROAD_USER_TYPE_CASE_SQL`
(and any equivalent grouping logic) to match `packages/shared` first, the
two are hand-synced, not generated from one source.
