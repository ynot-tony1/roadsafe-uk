# RoadSafe UK, build status

Last updated: 2026-08-04.
This file is a snapshot for resuming work, not a permanent doc. It should be
deleted or folded into docs/ once the project is further along.

## Where the code lives

Local only, at `/home/z/Projects/RoadSafety/roadsafe-uk`. Git is initialised
(`git init` has run) but **no commit has been made yet** and **nothing has
been pushed to GitHub**. `gh` is authenticated as `ynot-tony1` and `vercel`
is authenticated as `tonycowan56-6822`, but neither the GitHub repo nor the
Vercel project has been created.

CockroachDB Cloud is live: cluster `silent-jindo`, database `road_safety`.
It is currently empty (no STATS19 data ingested yet) but the full schema,
roles, and referential integrity are in place and verified.

## Completed and verified

Verified means the relevant command was actually run and its output checked,
not assumed.

### Infrastructure

- **Repo skeleton**: full directory structure from the spec, `.gitignore`
  (blocks `.env*`, `.env.cockroach.*`, real data files, build output),
  `.env.example`, `docker-compose.yml`, `pnpm-workspace.yaml`, root
  `package.json`, `.prettierrc.json`.
- **CockroachDB Cloud bootstrap (cluster `silent-jindo`)**: fully done and
  verified end to end.
  - Connected using the admin credential you placed in
    `.env.cockroach.bootstrap`, confirmed with a real query
    (`connected_as: tony-db`, CockroachDB v26.2.1). That file has since been
    truncated to empty, the admin credential is no longer held anywhere.
  - Created the `road_safety` database. Had to drop its auto-assigned
    multi-region setting (`ALTER DATABASE road_safety DROP REGION ...`),
    single-region clusters still default new databases into a region, which
    breaks Prisma's migration engine.
  - Created three least-privilege roles: `roadsafe_migrator` (schema owner,
    used only for `prisma migrate`), `roadsafe_ingestor` (SELECT/INSERT/
    UPDATE/DELETE on data tables, used by the Python ingestor),
    `roadsafe_app` (SELECT only, used by the Next.js app). Default privileges
    are set so future tables created by the migrator automatically grant the
    right access to the other two roles. `roadsafe_app`'s inability to write
    was verified with a real blocked `INSERT` (Postgres error 42501).
  - Applied the initial Prisma migration (`20260801190432_init`). Had to
    work around a CockroachDB v26 default
    (`sql.defaults.create_table_with_schema_locked`) that blocks Prisma's
    follow-up `ALTER TABLE` statements, disabled it for `roadsafe_migrator`
    only via `ALTER ROLE ... SET`.
  - **Found and fixed a real integrity bug**: the migration's trailing three
    `ALTER TABLE ... ADD CONSTRAINT` foreign key statements had silently
    never been applied (an earlier interrupted `migrate dev` run had
    completed the tables and indexes server-side after the client timed
    out, but stopped before the FK statements at the end of the file; later
    baselining with `migrate resolve --applied` recorded the migration as
    done without re-running it). This was only caught by actually testing
    cascade delete with real data, not by trusting `migrate status`. Fixed
    by applying the three `ADD CONSTRAINT` statements directly, after
    clearing one orphaned test row they revealed. Reverified with a fresh
    insert/delete: deleting a collision now genuinely cascades to its
    vehicles and casualties. `prisma migrate status` reports in sync.
  - Role connection strings are in `packages/database/.env` (migrator, plus
    a `SHADOW_DATABASE_URL` pointing at a dedicated `road_safety_shadow`
    database for future `prisma migrate dev` runs), `apps/web/.env.local`
    (app role, plus `NEXT_PUBLIC_*` map config), `services/ingestor/.env`
    (ingestor role). All gitignored. Role passwords are also in
    `.env.cockroach.roles` (gitignored), never printed to chat.

### packages/database

Complete Prisma schema (`packages/database/prisma/schema.prisma`) targeting
`provider = "cockroachdb"`, covering every model in spec section 8
(Collision, Vehicle, Casualty, CodeDefinition, LocalAuthority, H3Metric,
AnnualMetric, IngestionRun). Prisma Client is generated and has run many
real, successful queries and mutations against the live database this
session. `@types/node` was missing from its devDependencies, so its own
`tsc --noEmit` had silently never been run before, that's fixed and
`pnpm -r typecheck` now genuinely covers all three TS packages.

### packages/shared

Severity codes and colours, age bands, road-user groupings, the zoom to
H3-resolution strategy, map mode enum, and Zod schemas for the `/api/map/*`
query contracts.

- Switched from `NodeNext` to bundler-style module resolution and dropped
  the `.js` extensions on internal relative imports, Turbopack could not
  resolve them when consuming this package as raw TypeScript from
  `apps/web`.
- **Bugs found by live testing and fixed**:
  - `BoundingBoxSchema` used `z.number()` instead of `z.coerce.number()`,
    so bbox query params (always strings on the wire) failed validation
    every time.
  - Its area cap rejected legitimate nationwide aggregate queries at low
    zoom (a normal wide viewport centred on GB always shows some
    surrounding sea and other countries). Replaced with a clamp into a
    generous envelope rather than a hard reject; the raw points route
    keeps its own tight area cap where that limit actually belongs.
  - `sourceStatus: SourceStatusFilterSchema.optional()` silently returned
    `undefined` instead of the intended `'FINAL'` default when the field
    was omitted entirely, because Zod's `.optional()` short-circuits on a
    missing key before an inner `.default()` ever runs. Fixed by dropping
    the redundant `.optional()`. This was caught by a unit test, not by
    manual testing, the API routes happened to mask it with their own
    `?? "FINAL"` fallback.
- **Tests**: `packages/shared` now has a real Vitest suite, 32 tests across
  5 files (severity, age bands, road user groups, zoom strategy, map
  schemas), all passing. These specifically regression-test the three bugs
  above.

### services/ingestor

The full Python package, streaming CSV import, OSGR to WGS84 conversion,
H3 index calculation, CKAN-based source discovery, Typer CLI with all
required commands, Dockerfile.

- **Extended this session**: `aggregates/annual_metrics.py` only built
  national totals, national-by-severity, and local-authority totals. The
  web app's `/road-users` and `/local-authorities/[code]` pages needed
  national-by-road-user-type and local-authority-by-severity /
  by-road-user-type too, so those three additional aggregate queries were
  added (using a `CASE WHEN` mirroring `packages/shared`'s
  `CASUALTY_TYPE_GROUPS`, kept in sync by hand since the two are different
  language runtimes). This was a deliberate fix to a real design gap: the
  web pages would otherwise have been permanently empty even after a real
  ingestion, since the ingestor never produced the rows they query.
- **Test results**: `pytest`: 28 passed, 0 failed (rerun after the
  aggregates change, still green). `ruff check .`: clean. `ruff format
  --check .`: clean. `mypy src` (strict): 0 issues in 24 source files.
  These are unit tests against fixture CSVs and a mocked CKAN response,
  the ingestor has not yet been run against the live database (see Not
  started).

### apps/web

All 9 pages from spec section 7 are built, plus the full `/api/map/*`
route layer. Everything below was verified against the real, live
`road_safety` database, either in its genuine empty state or with
temporary smoke-test rows inserted and then deleted afterwards, never
against a mock.

- **App shell**: shadcn/ui (Nova preset, Radix base, Lucide icons), full
  component set, theme provider (light/dark/system, hydration-safe toggle
  using `useSyncExternalStore`), sticky header/nav, mobile sheet menu, OGL
  attribution footer.
- **`/api/map/*` routes**, all six required: `h3`, `clusters`, `collisions`
  (raw points, cursor-paginated), `collisions/[collisionIndex]` (detail,
  deliberately excludes `ageOfCasualty`, only the age band is ever
  selected), `legend`, `available-filters`. Built on one shared SQL filter
  builder (`lib/api/collision-filters.ts`) so filter semantics can't drift
  between endpoints.
- **`/` national dashboard**: real Prisma queries against `AnnualMetric`,
  correct empty state with nothing ingested, verified with temporary test
  rows that stat cards, KSI arithmetic, the trend chart, and the road user
  breakdown all render correctly, then deleted.
- **`/map`**: MapLibre GL JS + deck.gl, all 9 map modes (heatmap, hexagons,
  clusters, individual collisions, KSI only, pedestrian, cyclist,
  motorcyclist, young driver), URL-synced filters and mode, zoom-dependent
  H3 resolution/raw-points switching, results table, collision detail
  sheet, legend. Verified with a real headless browser: screenshots
  confirmed the basemap actually renders, all 9 modes were clicked through
  with zero failed API calls, zooming in to trigger the raw points layer
  worked, filter toggling correctly updated the URL, dark mode rendered
  correctly.
- **`/local-authorities`** and **`/local-authorities/[code]`**: searchable
  list, per-authority trend/severity/road-user breakdown, a transparent
  collisions-per-100,000-population rate with its denominator and source
  year shown alongside it (never a bare number).
- **`/road-users`**: national casualty trend by road user type plus a
  latest-year breakdown.
- **`/hotspots`**: three separately labelled rankings (most collisions,
  most KSI, KSI rate per population), deliberately no blended "danger
  score", rate-based rankings always show their denominator.
- **`/about/data`**, **`/status`**, **`/collisions/[collisionIndex]`**: data
  provenance/licence/methodology page, live ingestion run history (correct
  "no runs yet" state), full collision detail page with a small MapLibre
  location preview.
- **Tests, all passing**:
  - Vitest: 21 tests across 4 files (`lib/format`, `lib/map/colors`,
    `lib/map/build-query`, `lib/api/collision-filters`).
  - Playwright e2e: 14 tests across 2 files, run against a live dev server
    talking to the real database. Covers every page loading with zero
    console errors, nav links, 404s for unknown collision/local-authority
    IDs, the theme toggle, and the map page's basemap/mode-switching/API
    behaviour. Had to `npx playwright install chromium` (browsers weren't
    present for this pinned Playwright version) before these could run.
  - `pnpm -r typecheck`, `pnpm lint`, `pnpm build`: all pass across the
    whole workspace. Two harmless Turbopack build warnings remain about
    re-exporting Prisma's generated CommonJS client with `export *`, a
    known Prisma/Turbopack interaction that doesn't affect runtime
    behaviour (confirmed working live), left alone rather than rewritten
    into a fragile manual export list.

### docs/ and README

Written this session, all ten files plus the root README, with Mermaid
diagrams in the README (component flow), `docs/architecture.md` (system
components), `docs/database.md` (entity relationship diagram), and
`docs/ingestion.md`/`docs/map-architecture.md` (pipeline/zoom-strategy
flowcharts). Content is grounded in the actual code (Prisma schema, the
Zod schemas, the ingestor CLI, the map's zoom-strategy function), not
generic boilerplate, each doc was written after re-reading the relevant
source files in this session. Covers: architecture, database schema and
roles, data source provenance/licensing, the ingestion pipeline's CLI
commands, the map's zoom-dependent query strategy, methodology (severity/
KSI/road-user/age-band definitions and what the project deliberately does
not claim), deployment order of operations, operations/runbook (workflow
table, responding to a failed ingestion run, credential handling),
privacy (age-band-not-exact-age enforcement, tied to the actual code
locations), and troubleshooting (every real bug hit this project,
including the missing-FK-constraints incident and the Zod
`.default().optional()` bug, written up in full).

A style scan (`grep` for em dashes and inline double hyphens) was run
against every new file; one em dash slipped into a first draft of
`docs/methodology.md` and was caught and fixed before this file was
last updated. Re-scanned clean afterward.

### .github/workflows

All five workflow files written and verified, not just written: every
`.yml` parses, and every command each job runs was actually executed
locally against a real, ephemeral CockroachDB container before being
trusted.

- **`ci.yml`**: two jobs. The TypeScript job's original design (a
  syntactically valid but unreachable `DATABASE_URL`) turned out to be
  wrong, proven by actually running `pnpm build` against it: `apps/web`
  has several ISR pages (`revalidate` on `/`, `/hotspots`,
  `/local-authorities`, `/local-authorities/[code]`, `/road-users`,
  `/status`) that Next.js genuinely queries the database for while
  prerendering at build time, not just at import time. Fixed by starting
  a real `cockroachdb/cockroach:v24.3.1` container in the job (via
  `docker run`, since GitHub Actions' `services:` block cannot override a
  container's command, and `start-single-node --insecure` has to be that
  command), creating an empty `road_safety` database, and running
  `pnpm db:migrate:deploy` before typecheck/lint/test/build. Verified end
  to end locally: migration applies cleanly against v24.3.1 with no
  schema-locked workaround needed (that issue was specific to CockroachDB
  Cloud v26), and the full build succeeds against the empty database with
  all 15 routes present.
  - This surfaced a real, separate typecheck bug while testing:
    `apps/web/lib/api/collision-filters.test.ts` called
    `collisionFilterConditions({})` and similar partial objects, relying
    on `MapFilters['sourceStatus']` being optional. It isn't, by design,
    `MapFiltersSchema`'s `sourceStatus` field carries a `.default()`, so
    `z.infer` (the output type, used everywhere `MapFilters` is consumed)
    makes it required after parsing; the two real callers
    (`app/api/map/*/route.ts`) always pass a fully-parsed, schema-output
    object, so the type was correct and the test was wrong. Fixed the
    test to pass `sourceStatus: "FINAL"` explicitly in each case, and
    removed a now-dead `?? "FINAL"` fallback in `collision-filters.ts`
    that this same confusion had left behind.
  - Also found while testing: `packages/database/generated/` (Prisma's
    generated client output, ~19 MB) was not in `.gitignore`. Added it,
    this would otherwise have been committed whole in the first commit.
  - The Python job runs `uv sync --group dev` then
    `ruff check` / `ruff format --check` / `mypy src` / `pytest`, all
    verified passing locally. Testing this surfaced a real bug in
    `services/ingestor/pyproject.toml`: the dev dependency pin
    `types-shapely==2.0.0.20240909` does not exist on PyPI, no version
    with that exact date was ever published. Fixed to the nearest real
    published version, `2.0.0.20240820`. Also narrowed
    `requires-python` from `>=3.12` to `>=3.12,<3.13`, an unbounded lower
    bound makes `uv sync` try to resolve a universal lockfile across
    Python 3.13+ too, where other dependency pins don't resolve; the
    project only ever targeted 3.12 in practice (Dockerfile, mypy config,
    ruff target-version). A `services/ingestor/uv.lock` now exists and is
    tracked, matching how `pnpm-lock.yaml` is already tracked for the TS
    side.
- **`check-road-safety-data.yml`**: weekly schedule plus manual dispatch.
  Runs `ingestor discover`, diffs its output against the previous run's
  output (persisted between runs via `actions/cache` with a
  `github.run_id`-suffixed key and a prefix `restore-keys` fallback, since
  cache keys are immutable and can't be overwritten directly), and opens a
  GitHub issue labelled `data-update` only when the output changed.
- **`ingest-road-safety.yml`**: manual dispatch only, with required `year`
  and `source_status` inputs. Deliberately not scheduled, changed this
  from the originally documented "scheduled, or manual dispatch" (see the
  `docs/operations.md` edit below) since an automatic import would
  contradict the "new data is always a human decision" principle already
  established for `check-road-safety-data.yml`. Gated on the
  `INGESTION_ENABLED` repository variable, with a separate explicit check
  that refuses a `PROVISIONAL` run unless `PROVISIONAL_DATA_ENABLED` is
  also set. Runs discover, download, import-code-lists, then
  `ingestor run <year>`, then cleanup.
  - Fixed a real doc/code mismatch found while writing this:
    `docs/ingestion.md`'s local-usage example used
    `data/raw/collision-2023.csv`-style per-year filenames, but
    `download_resource()` in `download.py` actually names files after
    `DatasetKind.value` only (`collisions.csv`, `vehicles.csv`,
    `casualties.csv`, `code_list.csv`), never per-year. Fixed the doc
    example and used the correct fixed filenames in the workflow.
- **`rebuild-aggregates.yml`**: manual dispatch with a required `year`
  input. Runs `build-h3`, `refresh-metrics`, then `verify` for that year.
- **`migrate-production.yml`**: manual dispatch, or on push to `main`
  touching `packages/database/prisma/migrations/**`. Runs
  `pnpm db:migrate:deploy` with `DATABASE_URL` set to the
  `MIGRATION_DATABASE_URL` secret (the `roadsafe_migrator` role). The only
  workflow with schema-write access.

`docs/operations.md`'s workflow table and `docs/ingestion.md` were both
updated to match what was actually built and verified, rather than the
pre-pause design notes.

## Not started

- The first git commit and the GitHub push. `gh repo create roadsafe-uk`
  has not been run. Nothing has been pushed anywhere.
- GitHub repository secrets/variables (`INGEST_DATABASE_URL` from the
  ingestor role, `MIGRATION_DATABASE_URL` from the migrator role,
  `INGESTION_ENABLED`, `PROVISIONAL_DATA_ENABLED`), the database side is
  ready, this just needs the GitHub repo to exist first.
- Vercel project link, environment variables (the `roadsafe_app`
  connection string plus `NEXT_PUBLIC_*` map config, already sitting in
  `apps/web/.env.local` ready to copy across), and preview/production
  deploys, can't happen until the GitHub repo exists.
- Running the ingestor against the live `road_safety` database at all.
  `roadsafe_ingestor`'s connection string is ready in
  `services/ingestor/.env`, but no CSV has been downloaded and no
  `import-*` command has been run for real yet.
- Any real data ingestion, calibration report, or the approval gate before
  a full five-year import (spec section 20). This explicitly needs your
  go-ahead before importing all five years once it's reached.

## Failing tests

None, across the entire workspace. `pytest`, `vitest` (both packages),
and `pnpm -r typecheck` / `pnpm lint` / `pnpm test` were rerun this
session after the workflow-file work below and are still green:

- `pytest` (ingestor): 28/28 passing.
- `vitest` (`packages/shared`): 32/32 passing.
- `vitest` (`apps/web`): 21/21 passing.
- `playwright test` (`apps/web` e2e): 14/14 passing (not rerun this
  session, unchanged since last verified).
- `pnpm -r typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`: all clean,
  `pnpm build` verified specifically against a real ephemeral CockroachDB
  container (see the `.github/workflows` section above), not just a
  placeholder connection string, since that turned out to be necessary.

## Exact next steps, in order

1. Make the first commit and run `gh repo create roadsafe-uk --private
   --source=. --push` (confirming the visibility/settings with you first).
   This is genuinely the next action, `.github/workflows/` is done and
   verified.
2. Set the GitHub secrets and repository variables using the role
   connection strings already sitting in the gitignored `.env` files:
   `INGEST_DATABASE_URL`, `MIGRATION_DATABASE_URL` as secrets,
   `INGESTION_ENABLED`, `PROVISIONAL_DATA_ENABLED` as variables. Also
   create the `data-update` label GitHub issues expects
   (`check-road-safety-data.yml`) if it doesn't already exist on the repo.
3. Link the Vercel project (`apps/web` as root directory), set its
   environment variables from `apps/web/.env.local`, confirm a real preview
   deployment builds.
4. Run the ingestor's `import-code-lists` and a real import of one
   representative final year against `road_safety`, produce the
   calibration report from spec section 20, and **stop for your explicit
   approval** before importing all five years.
5. Production deploy, then walk the full spec section 23 acceptance
   checklist against the live system before calling this done.

## How to resume

Just say "continue" (or similar). Everything needed to pick back up is
either in this file, already committed to disk in the repo, or in the
gitignored `.env` files listed above, nothing was left in an unrecoverable
half-done state: the dev server was stopped cleanly, all temporary
smoke-test data was inserted and then deleted, and the database is back to
its genuine empty starting state.
