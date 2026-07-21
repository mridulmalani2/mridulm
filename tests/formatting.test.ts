/**
 * PHASE 0 formatter gate (rebuild/PHASE_0_HOTFIX.md item 1).
 * The display boundary: engine/store values are raw floats; these formatters are the only
 * legitimate path to the DOM. Pins the exact bug classes seen live on 2026-07-04:
 * `$2026472.0` (no separators), `0.3478173110887373` (raw decimal in a % input),
 * `$101194.7m` promote precision.
 */
import { describe, it, expect } from 'vitest';
import {
  fmtCurrency, fmtNumber, fmtPct, fmtMultiple, pctToDisplay, displayToPct,
} from '../lib/formatters';

describe('fmtNumber — thousands separators', () => {
  it('separates thousands at 1dp default', () => {
    expect(fmtNumber(2026472.04)).toBe('2,026,472.0');
    expect(fmtNumber(390819.6)).toBe('390,819.6');
    expect(fmtNumber(78163.9)).toBe('78,163.9');
  });
  it('respects dp argument', () => {
    expect(fmtNumber(1234.5678, 2)).toBe('1,234.57');
    expect(fmtNumber(0.25, 2)).toBe('0.25');
  });
  it('handles small and negative values', () => {
    expect(fmtNumber(0)).toBe('0.0');
    expect(fmtNumber(-1234.5)).toBe('-1,234.5');
  });
  it('normalizes negative zero', () => {
    expect(fmtNumber(-0)).toBe('0.0');
    expect(fmtNumber(0 * -1)).toBe('0.0');
  });
});

describe('fmtCurrency — the live-site bug class', () => {
  it('formats the Apple-scale EV with separators (was $2026472.0)', () => {
    expect(fmtCurrency(2026472.0, 'USD')).toBe('$2,026,472.0m');
  });
  it('formats the MIP promote (was $101194.7m)', () => {
    expect(fmtCurrency(101194.7, 'USD')).toBe('$101,194.7m');
  });
  it('keeps magnitude for negatives (sign handled by callers via parens)', () => {
    expect(fmtCurrency(-500.25, 'GBP')).toBe('£500.3m');
  });
});

describe('percent input boundary (pctToDisplay / displayToPct)', () => {
  it('renders the raw-float margin as a clean percent (was 0.3478173110887373)', () => {
    expect(pctToDisplay(0.3478173110887373)).toBe('34.78');
  });
  it('trims trailing zeros without dropping significant digits', () => {
    expect(pctToDisplay(0.05)).toBe('5');
    expect(pctToDisplay(0.125)).toBe('12.5');
    expect(pctToDisplay(0.1)).toBe('10');
    expect(pctToDisplay(0)).toBe('0');
    expect(pctToDisplay(1)).toBe('100');
  });
  it('parses percent input back to a decimal fraction', () => {
    expect(displayToPct('34.78')).toBeCloseTo(0.3478, 10);
    expect(displayToPct('5')).toBeCloseTo(0.05, 10);
    expect(displayToPct('0')).toBe(0);
  });
  it('round-trips within float tolerance', () => {
    for (const v of [0.3478173110887373, 0.05, 0.021, 0.0075, 0.6]) {
      const rt = displayToPct(pctToDisplay(v));
      expect(rt).not.toBeNull();
      expect(Math.abs((rt as number) - v)).toBeLessThan(0.00005 + 1e-12);
    }
  });
  it('returns null on junk instead of writing NaN to the store', () => {
    expect(displayToPct('abc')).toBeNull();
    expect(displayToPct('')).toBeNull();
  });
});

describe('fmtPct / fmtMultiple — display precision', () => {
  it('IRR to 0.1pp', () => {
    expect(fmtPct(0.19123)).toBe('19.1%');
    expect(fmtPct(null)).toBe('—');
  });
  it('multiples to 0.1x', () => {
    expect(fmtMultiple(2.4012)).toBe('2.4x');
  });
});
