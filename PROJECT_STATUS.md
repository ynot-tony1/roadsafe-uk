# RoadSafe UK, build status

Last updated: 2026-08-06. The full five-year STATS19 import (2021-2025)
is complete and verified, two real map bugs found after deployment are
fixed and verified, and the new per-road safety rating feature is
**fully complete and live in production**: all of Great Britain's road
network is imported, 99.7% of collisions are snapped to a road, every
segment's rating is computed, and the live site is already serving it
correctly (verified against real data, see "Per-road safety ratings,
now complete" below). Nothing is running in the background.

One piece of local housekeeping, not a product issue: this machine's
`vercel` CLI login token expired partway through this session
(`Error: The specified token is not valid`). It didn't block anything,
Vercel's GitHub integration auto-deploys every push to `main` to
production independently of the local CLI, confirmed by querying the
live site and seeing it already served the finished feature without
needing a manual `vercel deploy`. Only run `vercel login` again if a
future change needs the CLI specifically (inspecting deployments,
managing env vars, etc.).

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

## Per-road safety ratings, now complete (2026-08-06)

The user's actual ask, once the map bugs above were fixed: rate
individual roads by safety, not just aggregated area/hexagon/point
views. Full design rationale, the performance investigations, and the
53-region dispatch list are in
[`docs/road-safety-ratings.md`](docs/road-safety-ratings.md); this is
the short version.

**Built, fully populated for all of Great Britain, and live in
production:**

- `road_segments` table: OSM road geometry (native CockroachDB
  `GEOMETRY(LineString, 4326)` column with a GIST index, added by hand
  in the migration since Prisma can't express spatial indexes
  declaratively) plus a derived `safety_rating` enum
  (`NEUTRAL`/`AMBER`/`DARK_AMBER`/`RED`). **5,233,954 road segments
  imported**, spanning Great Britain's full extent (confirmed via
  `ST_Extent`: lat 49.9-60.8, lng -8.6 to 1.8), real coverage checked
  directly in London, Glasgow, and Cardiff, not just the Cumbria
  prototype area.
- `services/ingestor/.../importers/road_network.py`: loads a Geofabrik
  `.osm.pbf` extract's vehicle-carrying roads (excludes footway/path/
  steps/bridleway/cycleway/pedestrian, STATS19 collisions essentially
  never touch those). Dispatched once per UK sub-region (51 English
  counties + Scotland + Wales) via
  `.github/workflows/import-road-network.yml`, all 53 regions
  successfully imported (an initial burst of 53 simultaneous jobs
  overloaded the free-tier cluster's connection limit, 14 of the
  largest/slowest regions failed or were cancelled; redispatching just
  those 14 once the other 39 had already finished and released their
  connections cleared it, no code bug).
- `services/ingestor/.../road_snapping.py`: snaps collisions to their
  nearest road segment within 30m (exact geography-based cutoff, not
  just the broad-phase index pre-filter) and computes each segment's
  rating: RED = any fatal or 10+ collisions, DARK_AMBER = any serious
  injury or 4+ collisions, AMBER = anything else with at least one,
  NEUTRAL = none. **512,387 of 513,795 collisions matched (99.7%)**,
  290,180 road segments rated (183,340 AMBER / 97,522 DARK_AMBER /
  9,318 RED), spot-checked the worst-rated roads and they're real,
  named UK streets with plausible collision histories (Beverley Road
  Hull, 91 collisions; Upper Tooting Road London, 51 collisions and 12
  serious injuries).
- New `/api/map/roads` route and a `ROAD_SAFETY` map mode: a DeckGL
  `PathLayer` colouring real road geometry by rating, road classes
  filtered by zoom (major roads only nationally, more local classes as
  you zoom in) the same way the H3 hexagon layer's resolution changes
  with zoom. Verified live in production against a non-Cumbria region
  (Leeds): querying `/api/map/roads` for a real Leeds bounding box
  returned genuine varied ratings (Tong Road and Burley Road both RED,
  10 and 12 collisions), not just the Cumbria prototype's coverage.
  **No manual redeploy was needed for this**: Vercel's GitHub
  integration auto-deploys every push to `main`, the frontend code had
  already been live since earlier in the session, only the underlying
  database needed to finish filling in, which the already-deployed API
  routes picked up automatically on the next request.

**Two more real bugs found and fixed while scaling the snapping step to
the full country** (the Cumbria prototype's 77,913-segment scope never
exercised either path):

1. A single unbounded snapping `UPDATE` hit `statement_timeout`
   (120s) against the full 5.2 million-segment table.
2. The first chunking fix still stalled after one batch: its
   termination check was "did the last batch match fewer collisions
   than requested", but some collisions genuinely never match (no road
   within 30m) and stay `road_segment_id IS NULL` forever, so a batch
   that correctly matched 1,982 of 2,000 candidates was wrongly read as
   "nothing left to do" and the run stopped having processed under
   2,200 of 513,801 collisions. Fixed with cursor-based pagination over
   `collision_index` that tracks candidates *seen*, not matched, the
   only thing that reliably reaches the true end of the table. Full
   detail on both, including the EXPLAIN output that diagnosed a
   multi-billion-row estimated sort in dense areas like central London,
   is in `docs/road-safety-ratings.md`.

## Exact next steps, in order

1. Walk the full spec section 23 acceptance checklist against the live
   production system, this has still not been done, everything so far
   is route-level and feature-level smoke-checking, not a systematic
   pass against the original spec's acceptance criteria.
2. Decide whether the 20-unmapped-local-authority-code gap (noted
   above, from 2026-08-05) is worth closing, and if so, source the
   pre-2023 English district names properly rather than from memory.
3. Purely optional polish, not a functional gap: `road_segments.name`
   is `NULL` for some OSM ways (unnamed service roads, some rural
   roads), the results table already falls back to "Unnamed road" for
   these, no fix needed unless it looks wrong in practice.
4. If a future change needs the local `vercel` CLI specifically
   (inspecting deployments, managing env vars), run `vercel login`
   first, its token expired partway through this session. Not needed
   for ordinary `git push`-triggered deploys, those go through
   Vercel's GitHub integration independently.

## How to resume

Just say "continue". Nothing is running in the background and nothing
was left mid-operation. Pick up at "Exact next steps" step 1 above.
