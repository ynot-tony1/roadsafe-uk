# RoadSafe UK, build status

Last updated: 2026-08-05 (evening). The full five-year STATS19 import
(2021-2025) is complete and verified, the app is live in production
against it, two real map bugs found after deployment are fixed and
verified, and a new per-road safety rating feature is built and mid-way
through a full Great Britain rollout, in progress unattended on GitHub
Actions right now. See "Per-road safety ratings" below for the current
state and exactly what's left.

## Where the code lives

Pushed to GitHub: `https://github.com/ynot-tony1/roadsafe-uk` (public, main
branch). **Live in production**: `https://roadsafe-uk.vercel.app` (project
`roadsafe-uk` under the `tony-f5c4` team), deployed from commit `6826330`,
verified via `vercel curl` (not plain `curl`, deployment protection's SSO
wall blocks that) that `/`, `/status`, and `/api/map/available-filters`
all return 200 with the complete five-year dataset, and `vercel logs
--since 5m` showed no errors immediately after promotion.

CockroachDB Cloud: cluster `silent-jindo`, database `road_safety`, live,
all five years (2021-2025) imported and verified. `SELECT source_year,
status, collisions_seen, vehicles_seen, casualties_seen FROM
ingestion_runs WHERE status = 'SUCCEEDED'` shows all five as `SUCCEEDED`,
513,801 collisions, 937,265 vehicles, 652,821 casualties total seen
(rejects are the tiny fraction of rows STATS19 itself flags as invalid,
see `ingestion_runs.rows_rejected`, not an ingestor bug).

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

## Fixed today (2026-08-05), resuming from the overnight pause

Checking the overnight import (the "Exact next steps" list from
2026-08-04) surfaced four more real, previously-undiscovered bugs, all
found by insisting on actual verification rather than trusting a green
workflow run:

1. **`local_authority_district_code` was always `-1` for 99.97% of
   rows.** DfT renamed `local_authority_district` to
   `local_authority_ons_district` (the real ONS GSS code) at some point
   and kept the old column in the CSV, permanently `-1`. The ingestor
   was still reading the dead column. Fixed in
   `services/ingestor/src/roadsafe_ingestor/models.py`; since the
   import is an upsert keyed on `collision_index`, redispatching every
   year with the fix corrected the existing rows in place, no data was
   lost or duplicated.
2. **`available-filters/route.ts`'s `CODE_LIST_FIELDS` used
   `_code`-suffixed names that never matched
   `code_definitions.field_name`** (seeded without the suffix), so
   every `codeLists` entry was an empty array. Fixed by renaming the
   route's field list to match the seed data already in the database
   (the lower-risk of the two options noted yesterday, nothing to
   re-import).
3. **`local_authorities` had never been seeded from anywhere.** Added
   `config/local-authorities/local-authorities.json`, a real copy of
   the ONS Open Geography Portal's "Local Authority Districts (April
   2025) Names and Codes in the UK (V2)" dataset filtered to Great
   Britain (350 rows; STATS19 does not cover Northern Ireland), plus
   `services/ingestor/src/roadsafe_ingestor/importers/local_authorities.py`
   and an `import-local-authorities` CLI command wired into
   `ingest-road-safety.yml`. `region` is the country derived from the
   GSS code prefix (England/Scotland/Wales), not the finer ONS England
   region breakdown, a deliberate scope cut, see
   `config/local-authorities/local-authorities.json`'s `note` field.
   **Known small gap:** 20 local authority codes appear in 2021-2025
   collision data but aren't in the April 2025 snapshot (roughly 9,600
   of 513,801 collisions, under 2%), almost entirely pre-2023 English
   district councils since merged into unitary authorities (the old
   North Yorkshire and Cumbria districts) plus `EHEATHROW`, which looks
   like a DfT special code for Heathrow Airport's private road network
   but that could not be confirmed against an authoritative source, so
   it is left unexplained rather than guessed at. These collisions
   still count correctly everywhere; only the local-authority name
   lookup for those specific codes is missing.
4. **Two real ingestion reliability bugs, not just bad luck:**
   `build_h3_all_dimension` and `build_national_annual_metrics` each
   ran their own commit outside `execute_batch_upsert`'s existing
   retry-on-serialization-conflict decorator, so a CockroachDB
   `SerializationFailure` there (routine under concurrent writes, not a
   bug in itself) was fatal instead of retried, this is what actually
   failed three of five years on today's first parallel redispatch, and
   in hindsight also explains an aggregate-build failure from
   yesterday's run. Fixed by sharing one retry decorator
   (`db.retry_on_serialization_conflict`) across all three functions.
   Separately, a large single-year import (2025) hung twice for 50+
   minutes with zero query activity visible on the cluster
   (`SHOW CLUSTER QUERIES`), most likely CockroachDB Cloud's SQL proxy
   losing track of the backend while keeping the client-facing socket
   alive, a failure mode neither TCP keepalives nor a server-enforced
   `statement_timeout` can see, since neither hop of that broken
   connection is the one either mechanism is watching. Both were added
   anyway as real, if partial, mitigations, and
   `timeout-minutes: 120` on the ingest job is the actual backstop,
   confirmed working (cancelled a hung run cleanly rather than leaving
   it to GitHub's multi-hour default).

All five years were then redispatched with every fix in place. Final
state, confirmed by querying `ingestion_runs` directly rather than
trusting the workflow UI: all five show `status = 'SUCCEEDED'`, all
five have H3 and annual aggregates built (`h3_metrics` has exactly 5
distinct `source_import_id`s, one per year), and
`local_authority_district_code` now holds real ONS codes.

Redeployed to preview (`vercel deploy`), spot-checked
`/api/map/available-filters` (both `codeLists` and the 350-entry
`localAuthorities` array are populated), `/`, `/status`,
`/hotspots`, `/road-users`, and `/map` (all 200), then promoted with
`vercel deploy --prod`, aliased to `https://roadsafe-uk.vercel.app`.

## Two real map bugs found and fixed after deployment (2026-08-05, evening)

The user reported the map itself wasn't usable after the redeploy above.
Investigated with real interaction (Playwright against the live production
site, not just reading code), found two independent, confirmed bugs:

1. **`/api/map/h3` and `/api/map/clusters` 500'd on every request.**
   `TypeError: Do not know how to serialize a BigInt`. CockroachDB's
   `count(*)` comes back as a JS `BigInt` through Prisma's raw query path
   regardless of the SQL's own `::int` cast, and `NextResponse.json`'s
   `JSON.stringify` can't serialize `BigInt`. Fixed by explicitly
   `Number()`-converting those fields in both routes.
2. **The map never refetched data after the very first load, at all,
   for any interaction.** DeckGL's own controller (enabled via the
   `controller` prop) is what actually receives mouse/touch/keyboard
   input, not the nested `<Map>`'s native handlers, so panning or
   zooming with the mouse never fired the MapLibre `moveend` event the
   data-loading code listened for. Confirmed via network-request
   logging: zero new `/api/map/*` requests fired after zooming in
   repeatedly, all the way to street level. This is why zooming in
   showed nothing. Fixed by also listening to DeckGL's own
   `onViewStateChange`, kept `onMoveEnd` too since it's still what fires
   for the `NavigationControl` zoom buttons, which call the native map
   directly and bypass DeckGL's controller.

Separately, `buildClusterLayer` painted every dot a flat blue regardless
of severity, contradicting its own "Collision severity" legend, fixed to
reuse the same red/orange/yellow blend the H3 hexagon layer already used.

All three fixed, verified with real Playwright interaction against
production (zoom/pan triggering real new network requests, cluster dots
showing varied colours matching the legend), redeployed to production.

## Per-road safety ratings (new feature, in progress)

The user's actual ask, once the above was fixed: rate individual roads by
safety, not just aggregated area/hexagon/point views. Full design
rationale, the two separate performance investigations, and the exact
53-region dispatch list are in
[`docs/road-safety-ratings.md`](docs/road-safety-ratings.md); this is
the short version.

**Built and deployed to production today:**

- `road_segments` table: OSM road geometry (native CockroachDB
  `GEOMETRY(LineString, 4326)` column with a GIST index, added by hand
  in the migration since Prisma can't express spatial indexes
  declaratively) plus a derived `safety_rating` enum
  (`NEUTRAL`/`AMBER`/`DARK_AMBER`/`RED`). `collisions.road_segment_id` is
  a new nullable FK, set by a separate snapping pass, never by the
  STATS19 importer.
- `services/ingestor/.../importers/road_network.py`: loads a Geofabrik
  `.osm.pbf` extract's vehicle-carrying roads (excludes footway/path/
  steps/bridleway/cycleway/pedestrian, STATS19 collisions essentially
  never touch those). New `ingestor import-road-network <pbf-path>` CLI
  command.
- `services/ingestor/.../road_snapping.py`: snaps collisions to their
  nearest road segment within 30m (exact geography-based cutoff, not
  just the broad-phase index pre-filter) and computes each segment's
  rating: RED = any fatal or 10+ collisions, DARK_AMBER = any serious
  injury or 4+ collisions, AMBER = anything else with at least one,
  NEUTRAL = none. New `ingestor snap-roads` CLI command.
- New `/api/map/roads` route and a `ROAD_SAFETY` map mode: a DeckGL
  `PathLayer` colouring real road geometry by rating, road classes
  filtered by zoom (major roads only nationally, more local classes as
  you zoom in) the same way the H3 hexagon layer's resolution changes
  with zoom.
- Prototyped and visually verified end-to-end on Cumbria before scaling
  up: screenshotted the live production map in `ROAD_SAFETY` mode over
  Workington/Cockermouth, real red/dark-amber road segments visible
  exactly where the underlying collision data says they should be, results
  table showing real road names ("Distington Bypass", trunk, 3
  collisions, 1 serious).

**In progress right now, unattended on GitHub Actions, not dependent on
this machine:** scaling from the Cumbria prototype to all of Great
Britain. `.github/workflows/import-road-network.yml` dispatched once per
UK sub-region (51 English counties + Scotland + Wales = 53 regions,
Geofabrik's own natural split, chosen so no single job risks GitHub's
6-hour limit the way one full-GB-in-one-job run plausibly could). First
burst of 53 parallel dispatches: 35 succeeded, 14 failed or were
cancelled (`OperationalError: consuming input failed: SSL connection has
been closed`, or a cancelled queue slot), almost certainly the free-tier
cluster genuinely overloaded by 53 simultaneous jobs each holding a
connection, not a code bug, the 14 that failed/cancelled were
disproportionately the largest/slowest regions (Scotland, Wales, Greater
London, Greater Manchester, Hampshire, Devon, and similar), consistent
with that theory. All 14 redispatched once the other 35 had already
finished and released their connections, reducing concurrent load;
that redispatch is what's currently running.

## Exact next steps, in order

1. Check `gh run list --workflow=import-road-network.yml -R
   ynot-tony1/roadsafe-uk --limit 60` for the 14 redispatched regions
   (west-yorkshire, west-sussex, west-midlands, warwickshire, surrey,
   suffolk, hampshire, greater-manchester, greater-london, essex,
   devon, derbyshire, wales, scotland). If any failed again, check its
   log for the actual error before blindly redispatching a third time,
   `import-road-network` upserts on `osm_way_id` so redispatching a
   region that already partially succeeded is always safe.
2. Once every region shows `SUCCEEDED`, dispatch
   `finalize-road-safety-ratings.yml` once (`gh workflow run
   finalize-road-safety-ratings.yml`), no inputs needed. Verify
   afterward: `SELECT safety_rating, count(*) FROM road_segments WHERE
   collision_count > 0 GROUP BY 1` should show a realistic distribution
   nationwide (Cumbria alone showed roughly 60% AMBER / 35% DARK_AMBER /
   4% RED among rated segments), and `SELECT count(*) FROM collisions
   WHERE road_segment_id IS NOT NULL` should be a large majority of
   513,801 (some will legitimately stay unmatched: collisions with no
   road within 30m, or a genuinely missing OSM road in that specific
   spot).
3. Redeploy to Vercel (`vercel deploy` then `vercel deploy --prod`
   once confirmed on the preview) so the `ROAD_SAFETY` map mode reflects
   the completed nationwide dataset instead of Cumbria-only coverage.
   Spot-check a few other UK regions in `ROAD_SAFETY` mode the same way
   Cumbria was verified, a screenshot showing real, varied road colours
   somewhere far from Cumbria (e.g. central London, Glasgow) is the real
   confirmation this worked, not just a clean workflow run.
4. Walk the full spec section 23 acceptance checklist against the live
   production system, this has still not been done, everything so far
   is route-level and feature-level smoke-checking, not a systematic
   pass against the original spec's acceptance criteria.
5. Decide whether the 20-unmapped-local-authority-code gap (noted
   above, from yesterday) is worth closing, and if so, source the
   pre-2023 English district names properly rather than from memory.

## How to resume

Just say "continue". The 14 redispatched regions are running unattended
on GitHub Actions, not dependent on this machine. Check them with `gh run
list --workflow=import-road-network.yml -R ynot-tony1/roadsafe-uk --limit
60` and pick up at "Exact next steps" step 1 above.
