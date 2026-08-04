# Data sources

## Primary source: STATS19

RoadSafe UK's collision, vehicle, and casualty data comes from the DfT's
[Road Safety Open Dataset](https://www.data.gov.uk/dataset/road-accidents-safety-data)
(also referred to as STATS19, the name of the police collision report form
it originates from). It covers every road collision in Great Britain that
was reported to the police and resulted in personal injury.

- **Publisher**: Department for Transport (DfT).
- **Licence**: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
  Free to use, adapt, and republish, with attribution, under Crown
  copyright.
- **Coverage**: Great Britain (England, Scotland, Wales). Northern Ireland
  publishes separate collision data under PSNI and is out of scope.
- **Update cadence**: final data for a calendar year is typically published
  around mid-year the following year; the DfT also publishes provisional
  in-year data at a finer cadence. This project only imports final data by
  default (`PROVISIONAL_DATA_ENABLED=false`); provisional data is treated
  as a distinct, separately labelled `source_status` and is never blended
  into headline figures without being visibly marked as provisional.
- **What's not included**: collisions not reported to police, damage-only
  collisions with no injury, and (for now) Northern Ireland.

The ingestor does not hardcode a URL for "this year's file". STATS19's
per-year asset URLs change with every publication, so
`services/roadsafe_ingestor/discovery.py` parses the DfT's catalog page and
the data.gov.uk CKAN API (both pinned as stable entry points in
`config/source-config.yml`) to find the currently published resources,
then works out which years are final versus provisional. See
[`ingestion.md`](ingestion.md) for how this discovery step feeds the rest
of the pipeline.

## Code lists

STATS19 encodes almost every field (severity, weather, road type, vehicle
type, and so on) as an integer rather than free text. The DfT publishes a
"Road Safety Open Dataset Data Guide" resource alongside the data itself,
listing every code's meaning; this project imports that guide into the
`code_definitions` table (via `ingestor import-code-lists`, reading
`config/stats19-code-lists/code-lists.json`) so every coded value shown in
the UI has a traceable, versioned label rather than a hardcoded guess. Code
meanings have changed slightly across DfT guidance revisions over the
years; `code_definitions.valid_from_year`/`valid_to_year` records which
years each code's label actually applied to.

## Optional exposure datasets

`config/source-config.yml` also lists two optional datasets used only to
compute *rates* (never raw counts, which are always shown alongside their
denominator, never alone):

- **Road traffic estimates** (DfT, vehicle-miles by area): would let a
  future version show collisions per vehicle-mile rather than only per
  head of population. Currently `enabled: false`, not yet imported.
- **Population estimates** (ONS mid-year estimates): backs the
  population-normalised collision rate shown on `/local-authorities/[code]`
  and `/hotspots`. Currently sourced as static reference data in
  `local_authorities.population_denominator`, not a live ingestion.

Both are optional by design: if a project embedding RoadSafe UK's approach
doesn't have a comparable exposure dataset for its geography, the app
should degrade to raw counts with a clear "no rate available" state rather
than silently going without a denominator, since an unlabelled raw count
sorted as a "hotspot" ranking is exactly the kind of misleading statistic
this project's methodology (see [`methodology.md`](methodology.md))
deliberately avoids.

## Map tiles and basemap

The interactive map's basemap comes from [OpenFreeMap](https://openfreemap.org)
(`NEXT_PUBLIC_MAP_STYLE_URL`), built from OpenStreetMap data, chosen
because it requires no API key and no per-request billing, appropriate for
a portfolio project. Attribution is rendered in the site footer and on the
map itself (`NEXT_PUBLIC_MAP_ATTRIBUTION`), crediting OpenFreeMap,
OpenMapTiles, and OpenStreetMap contributors.
