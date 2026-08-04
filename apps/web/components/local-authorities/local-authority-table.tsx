"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount } from "@/lib/format";

export interface LocalAuthorityRow {
  code: string;
  name: string;
  region: string | null;
  latestYear: number | null;
  collisionCount: number | null;
}

export function LocalAuthorityTable({ rows }: { rows: LocalAuthorityRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) => row.name.toLowerCase().includes(q) || (row.region ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="Search local authorities"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        aria-label="Search local authorities"
      />
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Local authority</TableHead>
              <TableHead>Region</TableHead>
              <TableHead className="text-right">Latest year collisions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No local authorities match your search
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.code}>
                  <TableCell>
                    <Link
                      href={`/local-authorities/${row.code}`}
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.region ?? "Not recorded"}</TableCell>
                  <TableCell className="text-right">
                    {row.collisionCount !== null ? formatCount(row.collisionCount) : "No data"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
