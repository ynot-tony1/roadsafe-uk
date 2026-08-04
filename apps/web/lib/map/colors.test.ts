import { describe, expect, it } from "vitest";

import { hexToRgb, withAlpha } from "@/lib/map/colors";

describe("hexToRgb", () => {
  it("converts a hex colour to an RGB triple", () => {
    expect(hexToRgb("#b91c1c")).toEqual([185, 28, 28]);
  });

  it("handles lowercase and uppercase hex the same way", () => {
    expect(hexToRgb("#FFFFFF")).toEqual(hexToRgb("#ffffff"));
  });
});

describe("withAlpha", () => {
  it("appends and rounds the alpha channel", () => {
    expect(withAlpha([10, 20, 30], 128.6)).toEqual([10, 20, 30, 129]);
  });
});
