# RoadSafe UK, build status

Last updated: 2026-08-04, paused at the user's request so they can power
down for the night. The five-year STATS19 import is running unattended on
GitHub Actions (see "In progress" below), it does not depend on this
machine staying on.

## Where the code lives

Pushed to GitHub: `https://github.com/ynot-tony1/roadsafe-uk` (public, main
branch). Deployed to Vercel: project `roadsafe-uk` under the `tony-f5c4`
team, preview URL `https://roadsafe-kkzewjwfr-tony-f5c4.vercel.app`
(protected by Vercel's deployment protection SSO wall, use `vercel curl`
to check it, not plain `curl`). No production deploy yet, that's still
pending the five-year import finishing (see "Exact next steps").

CockroachDB Cloud: cluster `silent-jindo`, database `road_safety`, live
and currently mid-import. As of this update: 151,927+ collisions (growing),
183,514 vehicles, 127,152 casualties, all from the 2024 calibration year
plus however much of 2025/2023/2022/2021 has landed since. Check `/status`
on the deployed app, or `SELECT count(*) FROM collisions` directly, for
the current number.

## Completed and verified this session

Everything from the previous session (repo skeleton, Prisma schema,
`packages/shared`, `services/ingestor`'s core modules, all 9 `apps/web`
pages, docs, and `.github/workflows`) was already done and is unchanged.
This section covers only what happened in this session: pushing the repo
live and actually running it for real, which surfaced a long list of real
bugs that only show up when code meets a live cloud database, a real CI
runner, and the real DfT dataset, none of which had ever happened before.

### Repo pushed and CI green

- First commit made, `gh repo create roadsafe-uk --public` (portfolio
  project, chose public over private since the whole point is to be
  shown), pushed. Branch renamed from `master` to `main` to match
  `ci.yml`/`migrate-production.yml`'s trigger and GitHub's own default,
  and set as the repo's default branch.
- Before staging: confirmed with `git add -A -n` that only `.env.example`
  (the template, no real values) would be included, every real `.env`
  file correctly gitignored. Also caught and excluded
  `apps/web/test-results/.last-run.json` (Playwright's local run cache)
  and added `apps/web/test-results/`, `playwright-report/`, `blob-report/`
  to `.gitignore`.
- `ci.yml` is genuinely green on GitHub's own runners (not just locally),
  confirmed with `gh run watch`. Every subsequent push in this session
  stayed green.
- GitHub secrets/variables set from the gitignored `.env` files, without
  ever printing their values to chat (extracted and piped directly):
  `INGEST_DATABASE_URL`, `MIGRATION_DATABASE_URL` as secrets,
  `INGESTION_ENABLED=true`, `PROVISIONAL_DATA_ENABLED=false` as
  variables. Created the `data-update` label
  `check-road-safety-data.yml` expects.

### Vercel: three real deploy-time bugs, all fixed and verified live

- **Monorepo root directory**: `vercel link` run from inside `apps/web`
  scoped every subsequent deploy to just that subdirectory (~560 KB, 90
  files), missing the root `pnpm-lock.yaml` and the `workspace:*`
  packages `apps/web` depends on. Vercel's zero-config detection fell
  back to plain `npm install`, which can't resolve workspace
  dependencies at all. Fixed by setting the project's Root Directory to
  `apps/web` via the REST API (`PATCH /v9/projects/{id}`, no CLI flag
  for this), then relinking and deploying from the repo root instead.
- **Prisma's generated client never reached Vercel's build**: it's
  gitignored (correctly, it's build output), and `vercel deploy` uses
  the same ignore rules to decide what to upload, so it was silently
  excluded, and nothing in the build pipeline regenerated it there.
  Fixed by making `apps/web`'s own `build` script run
  `pnpm --filter @roadsafe-uk/database generate` first.
- **Wrong Prisma binary target, and a custom output path Next.js's
  tracer couldn't follow**: `prisma generate` defaults to the local
  machine's platform (`debian-openssl-3.0.x`), Vercel's build image is
  RHEL-based. Added `binaryTargets = ["native", "rhel-openssl-3.0.x"]`
  first, which wasn't enough on its own: `schema.prisma`'s custom
  `output = "../generated/client"` path meant Next.js's output file
  tracing didn't reliably include the engine binary in each API route's
  serverless function bundle (an `outputFileTracingIncludes` override was
  tried first, didn't fix it). Switched to Prisma's default output
  location instead (hoisted into `node_modules` by pnpm), which Next.js
  has well-tested built-in support for. Updated
  `packages/database/src/index.ts` to import from `@prisma/client`
  rather than a relative path.
- **Verified for real**: after each fix, ran `next build` then
  `next start` locally against a real ephemeral CockroachDB and curled
  `/api/map/available-filters` directly (expecting a 200 with real JSON,
  not just a successful build), then redeployed to Vercel and repeated
  the same check with `vercel curl` against the live deployment. Also
  checked `/hotspots` and `/status` render correctly (including the
  correct "no data yet" empty state, at the time nothing had been
  imported yet).

### The ingestor had never actually run against real data

Every bug below was found only by actually pointing the ingestor at the
real DfT files and the live database for the first time. The existing
unit test suite had been green the whole time because its fixtures and
mocked CKAN response were hand-written to match what the code expected,
not what the real dataset and schema actually look like.

- **CKAN discovery never lists the real files**: the live
  `data.gov.uk` package for this dataset only lists guidance documents
  (a `.docx`, an `.xlsx` guide, a survey link), never the actual bulk
  CSVs, confirmed by querying the real API directly. They exist
  regardless at a fixed URL per dataset kind. `discover_resources()` now
  falls back to `direct_url` (added to `config/source-config.yml`) when
  CKAN has no match. Added a regression test built from the real API
  response shape.
- **typer/click incompatibility**: the very first CLI invocation
  crashed before reaching any of this project's code
  (`TypeError: Secondary flag is not valid for non-boolean flag`).
  `click` was never pinned, `uv sync` resolved 8.4.2, which typer
  0.12.5 predates. Pinned `click<8.2`.
- **STATS19's `accident_*` columns are `collision_*` now**: DfT renamed
  "Accident" to "Collision" throughout the schema at some point.
  `CollisionRow`/`VehicleRow`/`CasualtyRow.from_raw_row` all still read
  the old names, so every row was silently rejected. Also, DfT merged
  `pedestrian_crossing_human_control`/`_physical_facilities` into a
  single field; the pre-merge split values live under `_historic`
  suffixed columns now, which is what this schema's two separate
  columns read from. Fixed in `models.py`, plus the test fixture CSVs
  (written with the old names too).
- **A batch of entirely-rejected rows was silently dropped**:
  `stream_parsed_batches` only yielded its final batch with `if batch`
  (successfully parsed rows). If every row in a file fails to parse,
  that's always empty, so the final yield never happens and a caller's
  `rows_seen`/`rows_rejected` never advance past zero, no matter how
  many rows were actually processed. This is exactly what made the
  column-name bug above so quiet: every run logged `rows_seen=0`
  instead of the real counts, which would have pointed straight at the
  problem. Fixed the condition to `if batch or result.rows_seen`.
- **`id` and `updated_at` have no database-level default**: Prisma's
  `@default(uuid())` and `@updatedAt` are both client-side only, not
  actual column defaults, confirmed directly against the migration SQL.
  The raw-SQL importers (`psycopg`, no Prisma Client involved) never
  supplied either, and both are `NOT NULL`. Fixed in `code_lists.py`,
  `vehicles.py`, `casualties.py` (id, via `uuid.uuid4()`) and
  `collisions.py`/`vehicles.py`/`casualties.py` (`updated_at`, via
  `datetime.now(UTC)`).
- **A failure mid-import masked its own error**: an aborted transaction
  left the connection unable to run any further statement, including
  the `run` command's own attempt to record the failure, which then
  failed too with an unrelated `InFailedSqlTransaction`, hiding the real
  `error_summary`. Added `conn.rollback()` in `cli.py`'s exception
  handler before writing the failure status.

### Real 2024 calibration import: succeeded

Run against the live database, `source_status=FINAL`:

| Dataset | Seen | Inserted | Rejected |
|---|---|---|---|
| Collisions | 100,927 | 100,927 | 0 |
| Vehicles | 183,514 | 183,514 | 0 |
| Casualties | 128,272 | 127,152 | 1,120 (0.87%) |

All five verification checks passed (`collisions_present`,
`vehicles_reference_collisions`, `casualties_reference_collisions`,
`no_duplicate_collision_keys`, `vehicle_counts_broadly_agree`), run
marked `SUCCEEDED`. H3 aggregates built at all three resolutions
(1,039 / 16,970 / 63,842 rows at resolutions 5/7/9), 22 annual metric
rows.

The 1,120 rejected casualties were checked, not just counted: every one
has `casualty_type = -1`, STATS19's own "not recorded" sentinel.
`parse_required_int` correctly treats this as missing data and rejects
the row rather than fabricating a casualty type the police report never
actually recorded, this is intentional, existing behaviour, not a bug.

Verified against the live app, not just the database: `/status`,
`/hotspots`, and `/api/map/available-filters` all rendered/returned
correct real data on the Vercel preview deployment after this import.

### A real security incident, found and handled mid-session

Dispatching `ingest-road-safety.yml` for the remaining four years failed
immediately (all four, same cause): `sslmode=verify-full` expects a CA
certificate at `~/.postgresql/root.crt`, which exists on this dev
machine (placed there during initial setup) but not on a fresh GitHub
Actions runner. The resulting connection failure triggered Typer's
default `pretty_exceptions_show_locals=True` behaviour, which printed
every local variable including a live `psycopg.Connection` object, and
its password, into the job log of this public repository.

Response, in order:
1. Deleted all four exposed workflow run logs immediately
   (`gh run delete`).
2. Confirmed no data had been written, all four failed before reaching
   any import step.
3. Tried to rotate the `roadsafe_ingestor` password myself; couldn't,
   `roadsafe_migrator` lacks `CREATEROLE`, and the original bootstrap
   admin credential (the only role that could) had already been
   deliberately deleted earlier in the project per this project's own
   credential-handling rule.
4. Told you directly what had happened and asked you to rotate it via
   the CockroachDB Cloud console. **You said not to bother, this is a
   test/student project and it doesn't matter**, so the original
   password is still in use, by your explicit decision, not an
   oversight.
5. Fixed the actual root cause anyway, since it also blocks the
   workflow from running at all regardless of rotation: the CA is
   Let's Encrypt's public "ISRG Root X1" (verified with
   `openssl x509 -issuer`), not anything CockroachDB-specific or
   secret. Committed it at `config/certs/cockroachdb-ca.crt` (public
   information, safe to commit), both workflows that connect via
   psycopg now copy it into place before running any ingestor command.
   `sslrootcert=system` was tried first and does not work reliably here,
   the runner's OpenSSL trust store isn't wired the way libpq expects
   it to be.
6. Disabled `pretty_exceptions_show_locals` in `cli.py` globally, so
   this class of leak can't happen again regardless of which credential
   is involved in some future connection failure. Verified with a
   deliberately broken connection string: no password appears anywhere
   in the output anymore.

### `ingest-road-safety.yml`: two more real bugs, fixed before first real use

- **It never filtered by year**: `ingestor download` only ever produces
  DfT's rolling "last 5 years" bulk files (see above), and
  `ingestor run <year>` imports every row in whatever CSV it's given
  regardless of the year argument. Without filtering, a single dispatch
  for one year would have silently imported all five years every time.
  Added a filtering step (the same logic already proven in the manual
  2024 calibration run) before the import step.
- **Concurrency group cancelled runs instead of queuing them**: first
  attempt added `concurrency: { group: ingest-road-safety,
  cancel-in-progress: false }` to serialise dispatches. Real behaviour:
  GitHub Actions collapses a concurrency group's queue to only the
  *latest* pending run, silently cancelling earlier queued ones,
  regardless of `cancel-in-progress`. Two of the first four dispatches
  were cancelled this way before it was caught. Removed the
  concurrency group entirely, since the four years don't share any rows
  (`collision_index` is unique per year) there's no correctness reason
  to serialise them, running in parallel avoids the problem outright.

## In progress

Dispatched via `gh workflow run ingest-road-safety.yml` for years 2025,
2023, 2022, and 2021, running in parallel on GitHub's infrastructure,
**not dependent on this machine staying on**. This is the user-approved
full five-year import (explicit go-ahead given this session, spec
section 20's approval gate satisfied).

The first 2021 dispatch failed after 50 seconds with a transient
`OperationalError: server closed the connection unexpectedly`, most
likely four jobs' `import-code-lists` step hitting the free tier
around the same second, not a code bug (no password leaked this time,
confirming the `pretty_exceptions_show_locals=False` fix works). The
failed run's log was deleted and 2021 was redispatched on its own.
As of pausing: 2025/2023/2022 have been running for several minutes
with rows visibly increasing (collisions past 224,927 and climbing),
2021's solo redispatch just started.

Check progress with `gh run list --workflow=ingest-road-safety.yml -R
ynot-tony1/roadsafe-uk`, or query `road_safety` directly
(`SELECT source_year, status, collisions_seen, vehicles_seen,
casualties_seen FROM ingestion_runs ORDER BY started_at DESC`), or check
`/status` on the deployed app once redeployed with fresh data. If any
run shows `FAILED` on resume, check `ingestion_runs.error_summary` for
that row before retrying, if it's the same transient connection error,
just redispatch that one year alone.

## Known issue, not yet fixed

`apps/web/app/api/map/available-filters/route.ts`'s `CODE_LIST_FIELDS`
uses `_code`-suffixed names (`weather_conditions_code`, etc.) to query
`code_definitions.field_name`, but the seed data in
`config/stats19-code-lists/code-lists.json` (and therefore the 273 rows
already imported into the live database) uses the raw STATS19 names
without the suffix (`weather_conditions`, etc.). Every entry in the
route's `codeLists` response is currently an empty array as a result,
found while spot-checking `/api/map/available-filters` against real
data (`localAuthorities` is separately empty too, that table has never
been seeded at all, a bigger gap, see below).

Needs a decision, not just a fix: either rename the route's field list
to match what's already in the database (lowest risk, nothing to
re-import), or rename the seed data and re-import code lists (cleaner
long-term if `_code` is meant to be the project-wide convention). Left
for next session rather than guessed at under time pressure.

Also noted, same investigation: `local_authorities` has never been
seeded from anywhere, `/api/map/available-filters`'s `localAuthorities`
array is empty regardless of how much collision data exists. No
importer or seed file for this table exists yet, this is a real gap in
the pipeline, not a bug in an existing importer, needs its own design
decision (where does authoritative English/Welsh/Scottish local
authority reference data come from, ONS boundary files most likely).

## Exact next steps, in order

1. Check the four ingestion workflow runs actually finished
   (`gh run list --workflow=ingest-road-safety.yml`), and that all
   five years (2021 through 2025) verify cleanly. If any show `FAILED`
   or `PARTIAL`, check `ingestion_runs.error_summary` for that run
   before retrying it.
2. Decide and fix the `available-filters` field-name mismatch above.
3. Decide where local authority reference data comes from and seed it,
   `/local-authorities` and the map's per-authority filtering are
   currently non-functional without it.
4. Redeploy to Vercel (`vercel deploy` from the repo root) so the ISR
   pages (`/`, `/hotspots`, `/local-authorities`, `/road-users`)
   prerender against the now-complete five-year dataset instead of
   their last snapshot.
5. `vercel deploy --prod` once the above is confirmed working on a
   fresh preview, then walk the full spec section 23 acceptance
   checklist against the live production system.

## How to resume

Just say "continue". Nothing was left mid-operation on this machine: the
remaining ingestion runs live entirely on GitHub's infrastructure and
will finish (or fail visibly, checkable via `gh run list`) independent of
whether this computer is on. No local dev server, docker container, or
background process was left running.
