import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About the data",
  description: "Where this data comes from, what it does and doesn't show, and how it is licensed.",
};

export default function AboutDataPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">About the data</h1>
        <p className="mt-1 text-muted-foreground">
          What this site shows, where it comes from, and its limitations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            All collision, vehicle and casualty data on this site comes from STATS19, the
            Department for Transport&apos;s dataset of police reported personal injury road
            collisions in Great Britain. Each collision record is linked to the vehicles involved
            and the casualties that resulted from it.
          </p>
          <p>
            STATS19 is published by the DfT on data.gov.uk under the{" "}
            <a
              href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Open Government Licence v3.0
            </a>
            . This site republishes and aggregates that data under the same licence and contains
            public sector information licensed accordingly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What this data does not show</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            STATS19 only includes collisions that were reported to the police and resulted in at
            least one personal injury. Collisions that were not reported, that involved damage
            only, or that were reported to insurers but not the police are not included. The true
            number of road casualties, particularly minor injuries, is understood to be higher
            than these figures show.
          </p>
          <p>
            A high collision count for an area does not by itself mean that area or route is more
            &quot;dangerous&quot;. It may simply carry more traffic. This site avoids opaque,
            single number danger or risk scores for exactly this reason. Where a rate is shown, it
            is always shown alongside its denominator (for example, collisions per head of
            population, or per billion vehicle miles) and the source and year of that denominator,
            so it can be checked and its limitations understood.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Final and provisional data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The DfT publishes STATS19 data for each year as provisional first, then finalises it
            once all police forces have completed reporting for that period. Figures for a
            provisional year can change once the final data is published. By default this site
            only shows final data. Provisional data, where available, is always labelled as such.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            STATS19 does not identify individuals. This site goes a step further and never shows
            an exact age for a casualty or driver anywhere in its public pages or API responses,
            only the age band DfT assigns (such as 16 to 20). Exact ages, where present in the
            source data, are used only internally to verify aggregate calculations.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Severity definitions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Each collision and casualty is assigned one of three severities by the reporting officer:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-foreground">Fatal</strong>, a death within 30 days of the collision as a result of it.</li>
            <li><strong className="text-foreground">Serious</strong>, an injury for which a person is admitted to hospital, or specific injury types defined by DfT reporting guidance.</li>
            <li><strong className="text-foreground">Slight</strong>, an injury not requiring hospital admission, such as a sprain or bruise.</li>
          </ul>
          <p>
            &quot;Killed or seriously injured&quot; (KSI) is the standard combination of fatal and
            serious used throughout UK road safety statistics, and is used the same way here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
