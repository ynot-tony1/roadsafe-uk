# Privacy

## What personal data STATS19 contains

STATS19 records are about collisions, not identified individuals, but
several fields are still personal data under UK GDPR in the broad sense
(information relating to an identifiable person), most notably exact ages
of drivers and casualties, sex, and (indirectly, in combination with
location, date, and other fields) potentially re-identifiable individuals
in rare, high-profile, or sparsely-populated-area cases. The DfT publishes
STATS19 openly precisely because it's been through this consideration
already, aggregated and coded to avoid direct identification (no names,
addresses, or vehicle registration numbers), but this project takes
additional, deliberate steps beyond simply republishing the DfT's fields
as-is.

## Age bands, not exact ages, in every public surface

`casualties.age_of_casualty` and the equivalent exact-age field for
drivers on `vehicles` are stored in the database (retained only because
one internal aggregate, young-driver involvement, needs the exact age
band boundary), but:

- **No route handler selects them for a public response.**
  `apps/web/app/api/map/collisions/[collisionIndex]/route.ts` deliberately
  never includes `ageOfCasualty` in its Prisma `select`, this is called
  out explicitly in that file's own code and in
  [`database.md`](database.md), not left implicit.
- **No page renders them.** Every UI surface (`/collisions/[id]`,
  `/road-users`, filters) uses `ageBandOfCasualtyCode`/
  `ageBandOfDriverCode` and `packages/shared`'s `ageBandLabel()`, which
  outputs a range ("21 to 25"), never a specific number.
- **Filters operate on bands, not ranges of exact ages.** The
  `youngDriverInvolved` filter and `YOUNG_DRIVER` map mode match against
  `age_band_of_driver_code` in (4, 5), not `age_of_driver BETWEEN 16 AND
  25`, so the query itself, not just the rendered output, never depends on
  exact age.

This is enforced by code review discipline (see the note in
`packages/database/prisma/schema.prisma` next to `ageOfCasualty`) rather
than a database-level constraint, since the field legitimately needs to be
readable by the ingestor's aggregate-building code. If this project grows
a wider set of contributors, a stronger enforcement (a separate
`roadsafe_app` grant that excludes the column entirely, verified the same
way the read-only role itself was verified) would be a reasonable
follow-up.

## Location precision

Collision locations are shown at the precision STATS19 itself publishes
(rounded OSGR grid references converted to lat/lon), not enhanced with any
higher-precision geocoding. At the map's most zoomed-in level, individual
collision points are shown, which is exactly what the source data already
makes public; this project neither reduces the DfT's own published
precision nor adds precision beyond it.

## Aggregation and small-number suppression

The DfT does not apply small-number suppression to STATS19 (unlike some
health or crime statistics), and this project currently follows that
precedent, showing exact counts even at small local-authority or hotspot
granularity, since the source publisher has already made a considered
decision that this level of detail is appropriate for a personal-injury
collision dataset. `/hotspots` and `/local-authorities/[code]` do,
however, always show the underlying denominator alongside any rate (see
[`methodology.md`](methodology.md)), so small, noisy counts remain visibly
small and noisy rather than masked into a misleadingly precise-looking
rate.

## Provisional vs. final data

Provisional in-year data is more likely to contain reporting errors or
later revisions than final annual data. It's tagged with
`source_status = PROVISIONAL` throughout the schema and is never blended
into a `FINAL`-labelled figure; the `sourceStatus` filter defaults to
`FINAL` everywhere (`packages/shared/src/map-schemas.ts`), so a user sees
only settled data unless they explicitly opt into provisional figures.
