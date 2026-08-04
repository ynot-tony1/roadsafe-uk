# STATS19 code lists

`code-lists.json` in this directory is a seed reference copy of the coded
field values published in the DfT "Road Safety Open Dataset Data Guide".
It is used to:

1. Bootstrap the `CodeDefinition` table so the application never has labels
   hardcoded only in frontend components (spec section 8.4).
2. Give the ingestor's fixtures and tests a known, stable set of values to
   validate against without a network call.

This seed file is not treated as authoritative at ingestion time. The
`ingestor import-code-lists` command downloads and parses the current
official data guide on every run, diffs it against what is stored in
`CodeDefinition`, and records the `source_version` and `valid_from_year` /
`valid_to_year` for whatever it finds, overriding this seed where they
differ. See docs/ingestion.md and docs/methodology.md.

Codes are grouped by `field_name`. Where a field name is shared between the
collision, vehicle and casualty files (for example `casualty_severity`
duplicating `accident_severity`'s three codes), each is listed separately
because the DfT guide documents them separately.
