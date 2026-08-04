import { describe, expect, it } from "vitest";

import { formatCount, formatYearRange } from "@/lib/format";

describe("formatCount", () => {
  it("formats with thousands separators", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });

  it("formats zero correctly", () => {
    expect(formatCount(0)).toBe("0");
  });
});

describe("formatYearRange", () => {
  it("collapses to a single year when from equals to", () => {
    expect(formatYearRange(2023, 2023)).toBe("2023");
  });

  it("shows a range when the years differ", () => {
    expect(formatYearRange(2019, 2023)).toBe("2019 to 2023");
  });
});
