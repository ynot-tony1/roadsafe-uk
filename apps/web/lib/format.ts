const numberFormatter = new Intl.NumberFormat("en-GB");

export function formatCount(value: number): string {
  return numberFormatter.format(value);
}

export function formatYearRange(fromYear: number, toYear: number): string {
  return fromYear === toYear ? String(fromYear) : `${fromYear} to ${toYear}`;
}
