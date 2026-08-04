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

## Playwright

### Pinned browser build missing

`npx playwright test` failed to launch because the specific Chromium
build this Playwright version pins
(`chromium_headless_shell-1155`) wasn't installed, even though an
unrelated Chromium build from a different tool was present on the
machine.

**Fix**: `npx playwright install chromium`. One run hit a transient
network timeout downloading the browser; retrying succeeded.
