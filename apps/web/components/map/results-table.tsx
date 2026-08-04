import { SEVERITY_LABELS } from "@roadsafe-uk/shared";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount } from "@/lib/format";
import type { ClusterPoint, CollisionPoint, H3Cell } from "@/lib/map/types";

type ResultsTableProps =
  | { kind: "h3"; rows: H3Cell[] }
  | { kind: "clusters"; rows: ClusterPoint[] }
  | { kind: "points"; rows: CollisionPoint[]; onSelect: (collisionIndex: string) => void };

export function ResultsTable(props: ResultsTableProps) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      <Table>
        <caption className="sr-only">
          Accessible tabular listing of the data currently shown on the map
        </caption>
        {props.kind === "h3" || props.kind === "clusters" ? (
          <>
            <TableHeader>
              <TableRow>
                <TableHead>H3 cell</TableHead>
                <TableHead className="text-right">Collisions</TableHead>
                <TableHead className="text-right">Fatal</TableHead>
                <TableHead className="text-right">Serious</TableHead>
                <TableHead className="text-right">Slight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No collisions in the current view
                  </TableCell>
                </TableRow>
              ) : (
                props.rows.map((row) => (
                  <TableRow key={row.h3Index}>
                    <TableCell className="font-mono text-xs">{row.h3Index}</TableCell>
                    <TableCell className="text-right">{formatCount(row.collisionCount)}</TableCell>
                    <TableCell className="text-right">{formatCount(row.fatalCount)}</TableCell>
                    <TableCell className="text-right">{formatCount(row.seriousCount)}</TableCell>
                    <TableCell className="text-right">{formatCount(row.slightCount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </>
        ) : (
          <>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-right">Vehicles</TableHead>
                <TableHead className="text-right">Casualties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No collisions in the current view
                  </TableCell>
                </TableRow>
              ) : (
                props.rows.map((row) => (
                  <TableRow
                    key={row.collisionIndex}
                    className="cursor-pointer"
                    onClick={() => props.onSelect(row.collisionIndex)}
                  >
                    <TableCell className="font-mono text-xs">{row.collisionIndex}</TableCell>
                    <TableCell>{new Date(row.date).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell>
                      {SEVERITY_LABELS[row.severityCode as 1 | 2 | 3] ?? row.severityCode}
                    </TableCell>
                    <TableCell className="text-right">{row.numberOfVehicles}</TableCell>
                    <TableCell className="text-right">{row.numberOfCasualties}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </>
        )}
      </Table>
    </div>
  );
}
