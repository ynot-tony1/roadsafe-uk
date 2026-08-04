import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Collision, vehicle and casualty data: Department for Transport, STATS19, under the{" "}
          <a
            href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Open Government Licence v3.0
          </a>
          . Contains public sector information licensed under the Open Government Licence.
        </p>
        <Link href="/about/data" className="underline underline-offset-4 hover:text-foreground">
          About the data
        </Link>
      </div>
    </footer>
  );
}
