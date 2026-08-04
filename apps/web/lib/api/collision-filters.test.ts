import { Prisma } from "@roadsafe-uk/database";
import { describe, expect, it } from "vitest";

import { bboxCondition, collisionFilterConditions, whereClause } from "@/lib/api/collision-filters";

describe("collisionFilterConditions", () => {
  it("defaults to FINAL source status when none is given", () => {
    const conditions = collisionFilterConditions({ sourceStatus: "FINAL" });
    const combined = Prisma.join(conditions, " AND ").sql;
    expect(combined).toContain("source_status");
  });

  it("omits the source status condition when ALL is requested", () => {
    const conditions = collisionFilterConditions({ sourceStatus: "ALL" });
    const hasSourceStatus = conditions.some((c) => c.sql.includes("source_status"));
    expect(hasSourceStatus).toBe(false);
  });

  it("maps severity labels to their numeric codes", () => {
    const conditions = collisionFilterConditions({
      sourceStatus: "FINAL",
      severity: ["FATAL", "SLIGHT"],
    });
    const severityCondition = conditions.find((c) => c.sql.includes("severity_code"));
    expect(severityCondition).toBeDefined();
    expect(severityCondition?.values).toEqual([1, 3]);
  });

  it("builds an EXISTS clause for pedestrian involvement", () => {
    const conditions = collisionFilterConditions({
      sourceStatus: "FINAL",
      pedestrianInvolved: true,
    });
    const pedestrianCondition = conditions.find((c) => c.sql.includes("casualty_type_code"));
    expect(pedestrianCondition?.sql).toContain("EXISTS");
    expect(pedestrianCondition?.values).toEqual([0]);
  });

  it("builds an EXISTS clause for young driver involvement using both age bands", () => {
    const conditions = collisionFilterConditions({
      sourceStatus: "FINAL",
      youngDriverInvolved: true,
    });
    const youngDriverCondition = conditions.find((c) => c.sql.includes("age_band_of_driver_code"));
    expect(youngDriverCondition?.values).toEqual([4, 5]);
  });

  it("produces no conditions for an empty filter set beyond the default source status", () => {
    const conditions = collisionFilterConditions({ sourceStatus: "ALL" });
    expect(conditions).toHaveLength(0);
  });
});

describe("bboxCondition", () => {
  it("parameterises all four bounds", () => {
    const condition = bboxCondition({ minLat: 51, maxLat: 52, minLng: -1, maxLng: 0 });
    expect(condition.values).toEqual([51, 52, -1, 0]);
  });
});

describe("whereClause", () => {
  it("returns TRUE for no conditions so callers can always AND it in safely", () => {
    expect(whereClause([]).sql.trim()).toBe("TRUE");
  });

  it("joins multiple conditions with AND", () => {
    const clause = whereClause([Prisma.sql`a = 1`, Prisma.sql`b = 2`]);
    expect(clause.sql).toContain("AND");
  });
});
