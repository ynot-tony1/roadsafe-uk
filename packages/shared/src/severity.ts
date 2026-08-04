/**
 * STATS19 accident_severity / casualty_severity codes.
 * Source: DfT "Road Safety Open Dataset Data Guide".
 */
export const SEVERITY_CODES = {
  FATAL: 1,
  SERIOUS: 2,
  SLIGHT: 3,
} as const;

export type SeverityCode = (typeof SEVERITY_CODES)[keyof typeof SEVERITY_CODES];

export const SEVERITY_LABELS: Record<SeverityCode, string> = {
  1: 'Fatal',
  2: 'Serious',
  3: 'Slight',
};

/** Colorblind-safe severity palette shared by the legend API and map layers. */
export const SEVERITY_COLORS: Record<SeverityCode, string> = {
  1: '#b91c1c',
  2: '#f97316',
  3: '#ca8a04',
};

/** "Killed or seriously injured", the standard UK road-safety KSI grouping. */
export const KSI_SEVERITY_CODES: SeverityCode[] = [SEVERITY_CODES.FATAL, SEVERITY_CODES.SERIOUS];

export function isKsi(severityCode: number): boolean {
  return (KSI_SEVERITY_CODES as number[]).includes(severityCode);
}
