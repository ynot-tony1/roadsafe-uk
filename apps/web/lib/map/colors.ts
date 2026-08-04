export type RgbaColor = [number, number, number, number];
export type RgbColor = [number, number, number];

export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function withAlpha(rgb: RgbColor, alpha: number): RgbaColor {
  return [rgb[0], rgb[1], rgb[2], Math.round(alpha)];
}
