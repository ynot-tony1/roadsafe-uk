import { describe, expect, it } from "vitest";

import { buildMapQueryParams, modeForcedParams } from "@/lib/map/build-query";

describe("modeForcedParams", () => {
  it("forces FATAL and SERIOUS severity for KSI_ONLY", () => {
    const params = modeForcedParams("KSI_ONLY");
    expect(params.getAll("severity")).toEqual(["FATAL", "SERIOUS"]);
  });

  it("forces the pedestrian road user filter for PEDESTRIAN mode", () => {
    const params = modeForcedParams("PEDESTRIAN");
    expect(params.getAll("roadUserType")).toEqual(["PEDESTRIAN"]);
  });

  it("sets youngDriverInvolved for YOUNG_DRIVER mode", () => {
    const params = modeForcedParams("YOUNG_DRIVER");
    expect(params.get("youngDriverInvolved")).toBe("true");
  });

  it("adds nothing for a plain aggregate mode", () => {
    const params = modeForcedParams("H3_HEXAGONS");
    expect([...params.keys()]).toHaveLength(0);
  });
});

describe("buildMapQueryParams", () => {
  it("merges bbox, user filters and mode-forced filters", () => {
    const params = buildMapQueryParams(
      { minLat: 51, maxLat: 52, minLng: -1, maxLng: 0 },
      { severity: ["SLIGHT"] },
      "KSI_ONLY",
    );
    expect(params.get("minLat")).toBe("51");
    // Mode-forced severities are appended alongside the user's own filter value.
    expect(params.getAll("severity")).toEqual(["SLIGHT", "FATAL", "SERIOUS"]);
  });
});
