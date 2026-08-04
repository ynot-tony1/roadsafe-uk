import { describe, expect, it } from 'vitest';
import { isKsi, KSI_SEVERITY_CODES, SEVERITY_CODES, SEVERITY_COLORS, SEVERITY_LABELS } from './severity';

describe('severity', () => {
  it('assigns exactly fatal and serious to KSI', () => {
    expect(KSI_SEVERITY_CODES).toEqual([SEVERITY_CODES.FATAL, SEVERITY_CODES.SERIOUS]);
  });

  it('classifies fatal and serious as KSI', () => {
    expect(isKsi(SEVERITY_CODES.FATAL)).toBe(true);
    expect(isKsi(SEVERITY_CODES.SERIOUS)).toBe(true);
  });

  it('does not classify slight as KSI', () => {
    expect(isKsi(SEVERITY_CODES.SLIGHT)).toBe(false);
  });

  it('does not classify an unknown code as KSI', () => {
    expect(isKsi(99)).toBe(false);
  });

  it('has a label and a colour for every severity code', () => {
    for (const code of Object.values(SEVERITY_CODES)) {
      expect(SEVERITY_LABELS[code]).toBeTruthy();
      expect(SEVERITY_COLORS[code]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
