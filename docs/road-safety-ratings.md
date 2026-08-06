# Per-road safety ratings

The `/map` page's "Road safety" mode colours individual roads by their
collision history, not just an aggregated area (hexagon, cluster, or raw
point). STATS19 itself has no road geometry, only a road number/class per
collision, so this feature layers in a second, independent data source:
OpenStreetMap road geometry, via Geofabrik's bulk `.osm.pbf` extracts.

## Data model

- `road_segments` (`packages/database/prisma/schema.prisma`): one row per
  OSM way, with a native CockroachDB `GEOMETRY(LineString, 4326)` column
  and a `GIST` index (added by hand in the migration's `.sql` file, Prisma
  has no declarative way to express a spatial index). `geometry` is
  `Unsupported` in the Prisma schema, read and written only via
  `$queryRaw`/`$executeRaw`, never through Prisma's typed query API.
- `collisions.road_segment_id`: nullable FK, set by a separate snapping
  pass, never by the STATS19 importer itself. `NULL` means either no road
  was close enough, or the road network for that area hasn't been
  imported yet, not that the collision happened off-road.

## Why only vehicle-carrying road classes

OSM's `highway` tag covers footways, cycleways, bridleways, steps, and
pedestrianised precincts alongside actual roads. STATS19 is exclusively
motor vehicle collisions, so those classes would only ever end up rated
`NEUTRAL` and roughly double the segment count for no benefit. Only these
classes are imported (`VEHICLE_HIGHWAY_CLASSES` in
`services/ingestor/src/roadsafe_ingestor/importers/road_network.py`):
`motorway(_link)`, `trunk(_link)`, `primary(_link)`, `secondary(_link)`,
`tertiary(_link)`, `unclassified`, `residential`, `living_street`,
`service`, `track`, `road`.

## The rating scheme

Requested in plain language: neutral if no crashes, amber if some low
severity, darker amber if more severity, red for very severe or many.
Implemented in `compute_road_safety_ratings`
(`services/ingestor/src/roadsafe_ingestor/road_snapping.py`):

| Rating | Condition |
|---|---|
| `NEUTRAL` | No collision has snapped to this segment. Column default, never written by the rating UPDATE. |
| `AMBER` | At least one collision, none serious or fatal, fewer than 4. |
| `DARK_AMBER` | Any serious-injury collision, or 4 or more collisions of any severity. |
| `RED` | Any fatal collision, or 10 or more collisions of any severity. |

`NEUTRAL` means "no STATS19 collision recorded here in the imported
window", not "verified safe". A road with genuinely zero traffic looks
identical to a road that just hasn't had a bad day yet.

## Performance: what actually turned out to matter

Two unrelated things were the actual bottleneck, in different places,
and neither was what it first looked like.

**Snapping collisions to roads.** One client round trip per collision
measured under 0.8 collisions/second, but `EXPLAIN ANALYZE` on a single
query showed only ~4ms of real server-side execution, the other >99% was
round-trip latency to the cluster (`gcp-europe-west2`). A single
set-based `UPDATE ... FROM (SELECT DISTINCT ON ...)` covering many
collisions in one round trip measured near 1,000 collisions/second, once
the broad-phase `ST_DWithin` pre-filter was tightened. The first attempt
at that pre-filter (0.001 degrees) was generous enough to pull in
hundreds of candidate segments per collision before the real
geography-based distance filter ever ran, which the query planner then
had to fully materialise and sort; tightening it to 0.0008 degrees (still
a safe upper bound for the real 30m cutoff at Great Britain's most
extreme latitudes) fixed it. See `BROAD_PHASE_DEGREES` in
`road_snapping.py` for the exact reasoning.

**Importing road geometry.** The opposite problem: batching didn't help.
Increasing the upsert batch size 10x (500 to 5000 rows) left throughput
essentially unchanged, ~250-260 ways/second either way, for the Cumbria
extract (77,913 relevant ways, real production data, not a synthetic
benchmark). That rules out round-trip latency as the bottleneck here;
`road_segments` carries a `GIST` spatial index that has to be maintained
on every write, and that index-maintenance cost, not the network, is
what actually caps this table's write throughput.

## Bringing in the rest of Great Britain

The Cumbria prototype (one English county, ~44MB extract) is imported
and rated. Scaling to all of Great Britain uses the same per-region
extracts Geofabrik already publishes, dispatched in parallel via
`.github/workflows/import-road-network.yml`, the same pattern the
five-year STATS19 import used for its five years. Splitting by region
instead of importing the single 2GB Great Britain-wide file keeps each
job comfortably inside a single GitHub Actions run (a full-GB single job,
extrapolated from Cumbria's measured rate, could plausibly run past
GitHub's 6-hour hard job limit) and lets CockroachDB serialize/retry
concurrent writes across many smaller jobs instead of one long one.

Every region to dispatch, `geofabrik_path` input value for each:

```
europe/united-kingdom/scotland
europe/united-kingdom/wales
europe/united-kingdom/england/bedfordshire
europe/united-kingdom/england/berkshire
europe/united-kingdom/england/bristol
europe/united-kingdom/england/buckinghamshire
europe/united-kingdom/england/cambridgeshire
europe/united-kingdom/england/cheshire
europe/united-kingdom/england/cornwall
europe/united-kingdom/england/cumbria
europe/united-kingdom/england/derbyshire
europe/united-kingdom/england/devon
europe/united-kingdom/england/dorset
europe/united-kingdom/england/durham
europe/united-kingdom/england/east-sussex
europe/united-kingdom/england/east-yorkshire-with-hull
europe/united-kingdom/england/essex
europe/united-kingdom/england/gloucestershire
europe/united-kingdom/england/greater-london
europe/united-kingdom/england/greater-manchester
europe/united-kingdom/england/hampshire
europe/united-kingdom/england/herefordshire
europe/united-kingdom/england/hertfordshire
europe/united-kingdom/england/isle-of-wight
europe/united-kingdom/england/kent
europe/united-kingdom/england/lancashire
europe/united-kingdom/england/leicestershire
europe/united-kingdom/england/lincolnshire
europe/united-kingdom/england/merseyside
europe/united-kingdom/england/norfolk
europe/united-kingdom/england/north-yorkshire
europe/united-kingdom/england/northamptonshire
europe/united-kingdom/england/northumberland
europe/united-kingdom/england/nottinghamshire
europe/united-kingdom/england/oxfordshire
europe/united-kingdom/england/rutland
europe/united-kingdom/england/shropshire
europe/united-kingdom/england/somerset
europe/united-kingdom/england/south-yorkshire
europe/united-kingdom/england/staffordshire
europe/united-kingdom/england/suffolk
europe/united-kingdom/england/surrey
europe/united-kingdom/england/tyne-and-wear
europe/united-kingdom/england/warwickshire
europe/united-kingdom/england/west-midlands
europe/united-kingdom/england/west-sussex
europe/united-kingdom/england/west-yorkshire
europe/united-kingdom/england/wiltshire
europe/united-kingdom/england/worcestershire
```

(Cumbria is already imported from the prototype; re-dispatching it is
harmless, `import-road-network` upserts on `osm_way_id`.)

Once every region above has finished (`gh run list
--workflow=import-road-network.yml`), dispatch
`.github/workflows/finalize-road-safety-ratings.yml` once to snap every
still-unmatched collision to the now-complete road network and compute
every segment's rating. Safe to re-run: snapping only ever touches
collisions with `road_segment_id IS NULL`, and rating computation is a
plain aggregate `UPDATE` with no cumulative state.

All 53 regions were imported (an initial burst of 53 simultaneous jobs
overloaded the free-tier cluster's connection limit, 14 of the
largest/slowest regions failed or were cancelled; redispatching just
those 14 once the other 39 had already finished and released their
connections cleared it, not a code bug). Final count: **5,233,954 road
segments**, spanning Great Britain's full extent (`ST_Extent` confirms
lat 49.9-60.8, lng -8.6 to 1.8), real coverage checked directly in
London, Glasgow, and Cardiff.

## Two more real bugs, only found once the full country was loaded

The Cumbria prototype's 77,913-segment scope was never enough to
exercise either of these; both only showed up once `finalize-road-safety-ratings.yml`
ran the snapping pass against the real, complete 5.2 million-segment
table.

**Bug 1: a single unbounded snapping `UPDATE` hit `statement_timeout`.**
`connect()`'s 120-second `statement_timeout` (added earlier this
session for an unrelated hung-connection problem, see
`docs/troubleshooting.md`) killed the first production run outright:
`QueryCanceled: query execution canceled due to statement timeout`.
The benchmark that measured ~1,000 collisions/second was against
Cumbria's 77,913 segments; against the real 5.2 million-segment table,
one unbounded statement covering all ~500k remaining collisions never
had a chance to finish in time.

**Bug 2: the first chunking fix stopped after one batch.** The obvious
fix, cap each `UPDATE` at `batch_size` rows via a `LIMIT`, ran into two
separate problems, discovered one after the other:

1. *Batching alone wasn't enough for dense areas.* A batch scoped to
   central London timed out even at a batch size of 20. `EXPLAIN`
   showed why: the query's `DISTINCT ON` semantics force CockroachDB to
   fully materialise the spatial join, and sort the result, across
   *every* matching collision in scope before the outer `LIMIT` can
   apply at all, an estimated 22 billion row sort for that London bbox.
   The identical query structure against Cumbria's far lower road and
   collision density ran in seconds, which is exactly why this never
   showed up in the prototype. Fixed by pre-selecting a small, bounded
   set of candidate collisions in a CTE (later an explicit
   `= ANY(...)` id list) *before* the spatial join runs, confirmed via
   `EXPLAIN` that the `LIMIT` now applies first. Verified empirically:
   2,000-row batches against both a London-scoped query and the real
   unscoped production query completed in ~2.9 seconds, real execution
   time, not an estimate.
2. *The termination check was wrong.* With batching fixed, the first
   real production run still stopped after processing under 2,200 of
   513,801 collisions, having matched 1,982 of its one and only
   2,000-row batch, 91% is a normal match rate (some collisions
   genuinely have no road within 30m and never match), but the loop's
   termination check was "did the last batch match fewer collisions
   than requested", which is not the same question as "are there more
   candidates left". A collision with no nearby road stays
   `road_segment_id IS NULL` forever, so treating "fewer matches than
   batch_size" as "nothing left to process" stops as soon as any batch
   happens to contain a few unmatchable rows, almost immediately in
   practice. Fixed with cursor-based pagination over `collision_index`:
   track candidates *seen* each batch, not matched, and only stop once
   a batch sees fewer candidates than requested, the actual end of the
   `road_segment_id IS NULL` pool in scope, regardless of how many of
   those candidates matched.

Final result after both fixes: **512,387 of 513,795 collisions matched
(99.7%)**, 290,180 road segments rated (183,340 AMBER / 97,522
DARK_AMBER / 9,318 RED). Spot-checked the worst-rated roads against
real UK geography rather than trusting the aggregate numbers alone:
Beverley Road (Hull, 91 collisions), Upper Tooting Road (London, 51
collisions, 12 serious injuries), Thornton Road (Bradford, 64
collisions), all real, named, plausible.
