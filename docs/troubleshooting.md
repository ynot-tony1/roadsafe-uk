# Troubleshooting

Real issues hit while building this project, kept here so they don't get
rediscovered the hard way a second time.

## CockroachDB Cloud

### New databases auto-assign a region, breaking Prisma migrations

Even on a single-region cluster, CockroachDB Cloud assigns a new database
a primary region by default. Prisma's migration engine issues DDL that
doesn't expect this, and migrations fail in confusing ways as a result.

**Fix**: immediately after creating a database, run
`ALTER DATABASE <name> DROP REGION <region>` before running any Prisma
migration against it. Needed twice in this project, once for `road_safety`
itself and once for the dedicated `road_safety_shadow` database used by
`prisma migrate dev`.

### `sql.defaults.create_table_with_schema_locked` blocks follow-up `ALTER TABLE`

CockroachDB v26 defaults to schema-locking newly created tables, which
blocks the follow-up `ALTER TABLE ... ADD CONSTRAINT` statements Prisma
emits at the end of a migration for foreign keys. This surfaces as the
migration failing partway through, after the `CREATE TABLE` statements
succeed but before the constraints are added.

**Fix**: `ALTER ROLE roadsafe_migrator SET create_table_with_schema_locked = false`,
scoped to the migrator role specifically (per CockroachDB's own
recommendation), rather than disabling it cluster-wide, which would affect
every role including the app and ingestor unnecessarily.

### Shadow database needs `CREATEDB`

`prisma migrate dev` needs to create and drop a shadow database to detect
drift; without `CREATEDB` on the role running it, this fails with error
code `P3014`.

**Fix**: grant `CREATEDB` to `roadsafe_migrator` temporarily for shadow
database operations, then revoke it once done if you want to keep the
role's privileges minimal outside of active migration development. In
this project it was granted, the shadow database created, and then
revoked again.

### `DROP TYPE ... CASCADE` is not supported

Unlike Postgres, CockroachDB does not support `CASCADE` on `DROP TYPE`.
If a migration needs to drop an enum type that's still referenced, drop
or alter the dependent columns/tables first, then drop the type
separately.

### DDL jobs continue server-side after the client disconnects

A `migrate dev` invocation that appears to time out or get interrupted on
the client side may have already completed its schema-change job on the
server. Don't assume a timed-out migration didn't apply, check the actual
schema state (`\d` in `cockroach sql`, or a direct `information_schema`
query) before retrying, retrying a migration that already partially
applied can produce confusing "already exists" errors, or worse, mask a
migration that actually did apply while your tooling's own state (Prisma's
migration history table) disagrees. This is exactly what caused the
missing foreign key bug below.

## The missing foreign key constraints bug

The most serious bug found while building this project. An earlier
`prisma migrate dev` run appeared to time out; the tables and indexes had
actually been created successfully server-side by the time the client gave
up, but the migration's final three `ALTER TABLE ... ADD CONSTRAINT`
statements (the foreign keys from `vehicles`/`casualties` back to
`collisions`) had not yet run. The migration was later baselined with
`prisma migrate resolve --applied`, which records a migration as done
without re-running its SQL, so this recorded the migration as fully
applied even though it wasn't.

`prisma migrate status` reported everything in sync. The gap was only
found by actually testing behaviour: inserting a collision with a vehicle
and a casualty, deleting the collision, and checking whether the
vehicle/casualty rows were cascade-deleted as the schema declares they
should be. They weren't, an orphaned row remained. A direct
`pg_constraint` query confirmed zero foreign keys existed on either table.

**Fix**: deleted the orphaned row, then manually applied the three
`ALTER TABLE ADD CONSTRAINT` statements from the migration file directly,
then reverified with a fresh insert/delete cycle that cascade delete
genuinely works.

**Lesson**: `prisma migrate status` (and any tool's own bookkeeping of
what it believes it did) is not proof that schema state matches
expectations, especially after any interrupted or baselined migration.
Verify structurally important behaviour (constraints, cascades, indexes)
directly against the database, and with a real read/write test, not just
by trusting the migration tool's own status report.

## Turbopack and workspace packages

### Cannot resolve `.js`-suffixed relative imports from a workspace package

`packages/shared` originally used `NodeNext` module resolution with
explicit `.js` extensions on relative imports (the correct pattern for
compiled NodeNext output), but Turbopack, consuming the package as raw
TypeScript source directly via a workspace link, couldn't resolve those
extensions against `.ts` files.

**Fix**: switched `packages/shared/tsconfig.json` to
`module: ESNext` / `moduleResolution: Bundler`, dropped the `.js`
extensions from internal relative imports, and added both workspace
packages to `apps/web/next.config.ts`'s `transpilePackages`, so Next.js
transpiles the workspace source directly rather than expecting a prebuilt
`dist/`.

## pydantic-settings

### `services/ingestor/.env` was never actually loaded

`Settings`'s `model_config` had no `env_file` set, so pydantic-settings
only ever read real process environment variables, never the `.env`
file the documented local workflow (`cp .env.example .env`, fill in
`INGEST_DATABASE_URL`) told you to create. `get_settings()` silently
returned an empty connection string instead of erroring, so this only
surfaced by explicitly checking `get_settings().ingest_database_url`
before a real run, not from any test (the test suite never depends on a
real `.env` file).

**Fix**: added `env_file=".env"` to `SettingsConfigDict`. Also found in
the same pass: the actual `services/ingestor/.env` file on disk had the
key written as `DATABASE_URL` instead of `INGEST_DATABASE_URL`, so even
with loading fixed it would have resolved to an empty string. Fixed the
key name directly in the gitignored file.

## Zod

### `.default(x).optional()` silently drops the default

`z.enum([...]).default('FINAL').optional()` does not default to `'FINAL'`
when the key is entirely absent from the input object, it returns
`undefined`. `ZodOptional` short-circuits on a missing/undefined key
before ever delegating to the inner `ZodDefault`, so the default only
applies when the key is present but explicitly `undefined`, not when it's
missing entirely, which is the common case for an omitted query
parameter.

**Fix**: drop the redundant `.optional()` when a field already has
`.default()`, a defaulted field is inherently optional for the caller
already. Found via a Vitest unit test (`map-schemas.test.ts`), not manual
testing, since the API routes' own `?? "FINAL"` fallback in application
code happened to mask the schema-level bug in practice.

### Query-string bbox params always failed validation

`BoundingBoxSchema` used `z.number()`, but query-string parameters are
always strings on the wire; every real bbox request failed Zod validation.

**Fix**: `z.coerce.number()` on all four bounds. Then a second bug: a
blanket area cap on the same schema rejected legitimate nationwide
low-zoom viewports (any wide view centred on Great Britain naturally
includes surrounding sea and other countries within its bounding box).

**Fix**: replaced the hard rejection with a `.transform()` that clamps
each bound into a generous fixed envelope (`CLAMP_BOUNDS`, covering GB and
a comfortable margin) rather than erroring, keeping a genuinely strict
area cap only on the raw-points route where an unbounded query would
actually be expensive.

## GitHub Actions

### `next build` needs a real, reachable database, not just a valid URL

The original assumption while designing `ci.yml` was that
`packages/database/src/index.ts` constructing `PrismaClient` eagerly at
import time meant `DATABASE_URL` only needed to be a syntactically valid
connection string in CI, never actually connected to. Running the exact
build command locally proved this wrong: several pages
(`/`, `/hotspots`, `/local-authorities`, `/local-authorities/[code]`,
`/road-users`, `/status`) use `revalidate`-based ISR, and Next.js
genuinely queries the database while prerendering them during
`next build`, not just at import time.

**Fix**: `ci.yml`'s TypeScript job starts a real, ephemeral
`cockroachdb/cockroach:v24.3.1` container (via `docker run`, since GitHub
Actions' `services:` block cannot override a container's command, and
`start-single-node --insecure` has to be that command), creates an empty
database, and runs `prisma migrate deploy` against it before building.

### GitHub Actions `services:` cannot override a container's command

CockroachDB's Docker image needs `start-single-node --insecure` as its
command to run usefully; the `services:` block in a workflow only
supports `image`, `env`, `ports`, `volumes`, and `options`, not `command`.

**Fix**: run the container directly with `docker run -d` in a regular
step instead of declaring it under `services:`, then poll
`cockroach sql --insecure -e "SELECT 1"` in a loop until it responds.

### `uv sync --all-groups` doesn't exist on older uv versions

Tested a pinned `astral-sh/setup-uv` version (`0.4.29`) locally by
installing that exact version and running the workflow's own `uv sync`
command against it: `--all-groups` isn't a recognised flag on that
version, only `--group <name>`.

**Fix**: use `uv sync --group dev` instead, which both versions support.

### A dependency pin that was never a real published version

`services/ingestor/pyproject.toml` pinned
`types-shapely==2.0.0.20240909`. No version of `types-shapely` with that
exact date was ever published to PyPI, the closest real releases bracket
it (`2.0.0.20240820` and `2.0.0.20241112`). `uv sync` failed immediately
with an unsatisfiable-dependency error.

**Fix**: pinned to `2.0.0.20240820`, the nearest real published version.
Also narrowed `requires-python` from `>=3.12` to `>=3.12,<3.13`: an
unbounded lower bound makes `uv` try to resolve a single lockfile that
also works on Python 3.13+, where this same pin's replacement doesn't
exist either, producing a confusing resolver error that looks unrelated
to the actual missing-version problem. The project only ever targeted
3.12 in practice (Dockerfile, mypy `python_version`, ruff
`target-version`), so the constraint just makes that explicit.

### Prisma's generated client was never gitignored

`packages/database/generated/` (Prisma's ~19 MB generated client output,
configured via `schema.prisma`'s `generator client { output = ... }`)
had no matching `.gitignore` entry, found only by running `prisma
generate` locally and noticing the directory appear as untracked. It
would otherwise have been committed whole in the first commit.

**Fix**: added `packages/database/generated/` to `.gitignore`.

## The ingestor had never actually run against real data

Every bug in this section was found only once the ingestor was pointed at
the real, live DfT files and a real CockroachDB Cloud database for the
first time. The unit test suite (fixtures, mocked CKAN responses) had
been passing the whole time, because it was built to match what the code
expected, not what the real dataset and schema actually look like.

### The live data.gov.uk CKAN package doesn't list the actual data files

`ingestor discover` always reported zero matching resources.
`test_discovery.py`'s mocked CKAN response had been hand-written to
include exactly the resources the code was looking for, and was never
checked against the real API. The live package for this dataset only
lists guidance documents (a `.docx` overview, a survey link, an `.xlsx`
data guide); the actual bulk collision/vehicle/casualty CSVs aren't CKAN
resources at all, they exist regardless at a fixed URL per dataset kind
(`https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-<kind>-last-5-years.csv`),
confirmed by fetching that URL directly.

**Fix**: added `direct_url` per dataset to `config/source-config.yml`;
`discover_resources()` falls back to it when CKAN has no match. Added a
regression test built from the real API response shape, not a
convenient fiction.

### typer 0.12.5 is incompatible with click 8.2+

The very first CLI invocation of any command crashed with `TypeError:
Secondary flag is not valid for non-boolean flag`, before reaching any
of this project's own code. `click` was never pinned, so `uv sync`
resolved the newest release (8.4.2); typer 0.12.5 predates a click 8.2
breaking change to how flag pairs are inferred.

**Fix**: pinned `click<8.2` alongside the existing `typer==0.12.5` pin.

### STATS19's `accident_*` columns are `collision_*` in the current export

DfT renamed "Accident" to "Collision" throughout the published schema at
some point (`accident_index` to `collision_index`, `accident_year` to
`collision_year`, `accident_reference` to `collision_ref_no`,
`accident_severity` to `collision_severity`). `CollisionRow.from_raw_row`,
`VehicleRow.from_raw_row`, and `CasualtyRow.from_raw_row` all still
looked up the old names, so every single row failed with "empty
accident_index" (or missing collision_severity, etc.), silently, because
of the `stream_parsed_batches` bug below.

DfT also merged `pedestrian_crossing_human_control` and
`pedestrian_crossing_physical_facilities` into a single
`pedestrian_crossing` field; the pre-merge split values are still
published under `pedestrian_crossing_human_control_historic` and
`pedestrian_crossing_physical_facilities_historic`, which is what this
schema's two separate columns now read from.

**Fix**: updated all three `from_raw_row` methods in `models.py`, plus
the test fixture CSVs (which had been written with the old column names
too, matching the code rather than reality).

### A batch of entirely-rejected rows was silently dropped

`stream_parsed_batches` only yielded its final partial batch with
`if batch:`, where `batch` holds successfully parsed rows. If every row
in a file fails to parse, `batch` never has anything in it, so the final
yield never happens at all, no matter how many rows were actually seen
and rejected. A caller's `final_result = running_result` inside
`for batch, running_result in stream_parsed_batches(...)` then never
executes even once, so `rows_seen` stays at its initial 0. This is
exactly what made the column-name bug above so quiet: every real run
logged `rows_seen=0` instead of "100927 rows, 100927 rejected", which
would have pointed straight at the real problem.

**Fix**: changed the condition to `if batch or result.rows_seen`, so the
final accumulated result always reaches the caller.

### `id` and `updated_at` have no database-level default

`Vehicle.id`, `Casualty.id`, `CodeDefinition.id`, and all three tables'
`updated_at` use Prisma's `@default(uuid())` / `@updatedAt`, both of
which Prisma implements client-side (the value is generated by Prisma
Client before the INSERT is sent), not as a column `DEFAULT` in the
actual migration SQL. The ingestor's raw-SQL importers (`psycopg`, no
Prisma Client involved) never supplied either, and both are `NOT NULL`,
so every insert failed.

**Fix**: `code_lists.py`, `vehicles.py`, and `casualties.py` now generate
`str(uuid.uuid4())` per row for `id` (matching the pattern
`ingestion_run.py` already used); `collisions.py`, `vehicles.py`, and
`casualties.py` now generate `datetime.now(UTC)` per row for
`updated_at`. `id` is deliberately excluded from each `UPDATE_COLUMNS`
list (an existing row keeps its own id across a re-import);
`updated_at` is included (it should bump on every write).

### A failure mid-import masked its own error message

When a batch insert genuinely fails, the connection's transaction is
left aborted; CockroachDB refuses every further statement on it,
including the `run` command's own attempt to record the failure
(`complete_run(status="FAILED", ...)`) until the transaction is rolled
back. Without a rollback first, that call raised its own
`InFailedSqlTransaction` error, which is what actually surfaced, not the
real `error_summary` already computed from the original exception, only
visible by reading the traceback's captured locals.

**Fix**: added `conn.rollback()` in `cli.py`'s `run` command exception
handler before calling `complete_run`.

## Vercel

### A gitignored generated Prisma client never reaches the Vercel build

`vercel deploy` uploads the working directory using the same ignore rules
as git. `packages/database/generated/` was gitignored (correctly, it's
build output), which meant Vercel's build never received it either, and
nothing in the build pipeline regenerated it there, since only `ci.yml`
had an explicit `prisma generate` step.

**Fix**: `apps/web`'s own `build` script now runs
`pnpm --filter @roadsafe-uk/database generate` before `next build`, so
the client is always freshly generated by whatever platform is actually
building it.

### A custom Prisma output path breaks output file tracing on Vercel

Even after the client was being generated on Vercel, dynamic API routes
still failed at runtime with "could not locate the Query Engine for
runtime rhel-openssl-3.0.x", while statically prerendered pages looked
fine. The prerendered pages were misleading: they render once during the
build itself (before Lambda packaging), so they don't exercise the same
code path a live request does.

The root cause: `schema.prisma`'s custom `output = "../generated/client"`
placed the generated client outside `apps/web`'s own directory tree.
Next.js's output file tracing decides which files to include in each
route's serverless function bundle, and it doesn't reliably follow
custom Prisma output paths under Turbopack, even with an explicit
`outputFileTracingIncludes` override in `next.config.ts` (tried first,
didn't fix it).

**Fix**: dropped the custom `output` path entirely, letting Prisma
generate to its default location (hoisted into `node_modules` by pnpm).
Next.js's tracer has well-tested built-in support for the default
`@prisma/client`/`.prisma/client` location. Updated
`packages/database/src/index.ts` to import from `@prisma/client` instead
of a relative path into `../generated/client`. Verified by running
`next build` then `next start` locally against a real ephemeral
CockroachDB and curling `/api/map/available-filters` directly (200,
real JSON), not just checking that the build succeeded, then redeployed
to Vercel and confirmed the same route returns 200 there too.

### Prisma's default binary target doesn't match Vercel's build runtime

Separately from the tracing issue above: `prisma generate` defaults to
building the query engine for whatever platform runs it, `debian-
openssl-3.0.x` on this machine, but Vercel's build image is RHEL-based
(`rhel-openssl-3.0.x`). Even once the client was reaching Vercel intact,
it only had the debian engine.

**Fix**: added `binaryTargets = ["native", "rhel-openssl-3.0.x"]` to
`schema.prisma`'s `generator client` block, so both engines are always
generated.

### GitHub Actions `services:` block also needs the app deployed via monorepo Root Directory

`vercel link` run from inside `apps/web` scoped both the link and every
subsequent `vercel deploy` to just that subdirectory, uploading only
~560 KB and 90 files, none of which included the root `pnpm-lock.yaml`
or the workspace packages `apps/web` depends on via `workspace:*`.
Without workspace context, Vercel's zero-config detection fell back to
plain `npm install`, which can't resolve `workspace:*` dependencies at
all.

**Fix**: set the Vercel project's Root Directory to `apps/web` via the
REST API (`PATCH /v9/projects/{id}` with `{"rootDirectory": "apps/web"}`,
there's no CLI flag for this), then relinked and redeployed from the
repository root instead of `apps/web`. This uploads the whole monorepo
while still building from `apps/web`, and lets Vercel's package-manager
detection walk up to the real `pnpm-lock.yaml`.

## Playwright

### Pinned browser build missing

`npx playwright test` failed to launch because the specific Chromium
build this Playwright version pins
(`chromium_headless_shell-1155`) wasn't installed, even though an
unrelated Chromium build from a different tool was present on the
machine.

**Fix**: `npx playwright install chromium`. One run hit a transient
network timeout downloading the browser; retrying succeeded.
