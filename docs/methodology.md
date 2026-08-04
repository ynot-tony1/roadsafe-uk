# Methodology

This document defines every derived metric and grouping RoadSafe UK shows,
and explains a few things it deliberately does not do.

## Severity and KSI

STATS19 codes each collision (and each casualty within it) with a severity
of `1` (Fatal), `2` (Serious), or `3` (Slight), defined in
`packages/shared/src/severity.ts`. "KSI" (Killed or Seriously Injured) is
the standard UK road-safety industry grouping of fatal + serious combined
(`KSI_SEVERITY_CODES`), used because fatal-only counts are small enough
per area/year to be statistically noisy on their own, while KSI is the
figure most UK road safety targets and reporting are actually set against.
Slight-only collisions are never silently excluded from totals, they're
simply broken out separately rather than blended into KSI.

## Road user groupings

STATS19's `casualty_type` field has ~30 distinct codes (different vehicle
sub-types, pedestrian, etc.). `packages/shared/src/road-user.ts` collapses
these into seven groups (pedestrian, cyclist, motorcyclist, car occupant,
bus/coach occupant, goods vehicle occupant, other) used throughout the UI,
because 30 categories in a filter panel or a chart legend is unusable, but
"other" is always a real, visible bucket, not a silent drop of
unrecognised codes. The exact code-to-group mapping is in that file, kept
in sync by hand with `services/ingestor/aggregates/annual_metrics.py`'s
`_ROAD_USER_TYPE_CASE_SQL`, which mirrors it in SQL for the ingestor's
aggregate queries, since the two run in different languages.

## Age bands, not exact ages

STATS19 records both an exact age and an age band for casualties and
drivers. Every public-facing query, filter, and page in this project uses
the age band (`age_band_of_casualty_code`/`age_band_of_driver_code`), never
the exact age. See [`privacy.md`](privacy.md) for why. Derived groupings:

- **Children**: age bands 1 to 3 (ages 0 to 15 inclusive).
- **Older road users**: age bands 10 to 11 (ages 66 and over).
- **Young driver involvement**: age bands 4 to 5 (ages 16 to 25 inclusive),
  used by the `YOUNG_DRIVER` map mode and the `youngDriverInvolved`
  filter, matched against `vehicles.age_band_of_driver_code` via an
  `EXISTS` subquery, not the casualty's own age band, since "young driver
  involved" means a young person was driving, not that a young person was
  a casualty.

These band boundaries are a configurable convention (see
`config/metric-definitions.yml`), not a fixed property of STATS19 itself;
a fork of this project targeting a different road-safety programme could
reasonably draw them differently.

## Rates always show their denominator

Every rate shown anywhere in the app (collisions per 100,000 population,
KSI rate) is rendered with its denominator and the denominator's source
year visible alongside it, never as a bare number. This is a hard rule
followed throughout `apps/web`'s local-authority and hotspots pages: a
rate without a visible denominator invites readers to compare figures that
aren't actually comparable (a shrinking-population area's rate rising
while its raw count falls, for instance), and hiding that context would
misrepresent the data.

## No blended "danger score"

`/hotspots` deliberately shows three separately labelled rankings (most
collisions, most KSI, KSI rate per population) rather than combining them
into a single composite "danger score". A blended score requires choosing
arbitrary weights between count, severity, and normalisation that STATS19
itself provides no basis for, and would present a subjective ranking as if
it were an objective one. Where a project needs a single ranking for a
specific operational purpose (for example, targeting road safety
interventions), that weighting should be a deliberate, documented decision
made by whoever owns that purpose, not a default baked into a general
analysis tool.

## What this project does not claim

- **Causation**: STATS19 records what happened and the coded circumstances
  around a collision, not why it happened. Correlations shown here
  (e.g. more collisions on roads with a given speed limit) are
  associations in the reported data, not causal claims.
  Under-reporting, changes in police recording practice over time, and
  changes in traffic volume are all confounders this project does not
  attempt to control for.
- **Completeness**: STATS19 only covers collisions reported to and
  recorded by the police. Near-misses, damage-only collisions, and
  collisions never reported are entirely absent from this data by
  definition.
- **Precision at small denominators**: rates computed on a small
  population or a small number of collisions (a sparsely populated local
  authority, a single year) are statistically noisy; the local authority
  and hotspots pages show the underlying counts precisely so a reader can
  judge this for themselves rather than the app asserting false precision.
