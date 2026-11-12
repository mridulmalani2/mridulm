/**
 * Small presentation rules a reader notices when they are broken: one minus sign in every
 * figure, a history table in one format, a clean export file name, no dark screen while the
 * deal engine loads.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { money, multiple, num, pct } from '../lib/format';
import { parse } from '../components/deal-engine/v2/fields';
import { fileStem } from '../components/deal-engine/results/exportModel';

const ROOT = join(__dirname, '..');

describe('one minus sign in every figure', () => {
  it('amounts, percentages, multiples and plain numbers all use the typographic minus', () => {
    for (const text of [money(-4580, 'USD', 0), pct(-0.052), multiple(-1.25, 2), num(-1234.5)]) {
      expect(text.startsWith('−'), text).toBe(true);
      expect(text).not.toContain('-');
    }
    expect([pct(0.052), num(0), num(-0.0001, 1)]).toEqual(['5.2%', '0.0', '0.0']); // no minus on a figure that rounds to nil
  });

  it('a figure copied from the page and pasted into an input is read back as the same number', () => {
    expect(parse(num(-60, 0), 'money')).toBe(-60);
    expect(parse('−2.5', 'pct')).toBeCloseTo(-0.025, 12);
    expect(parse('-60', 'money')).toBe(-60);
  });
});

describe('the history table shows every amount in one format', () => {
  it('capex is formatted as money, like revenue and EBITDA', () => {
    const src = readFileSync(join(ROOT, 'components/deal-engine/v2/HistoryTable.tsx'), 'utf8');
    expect(src).toContain('cell(h.capex, fmtMoney)');
    expect(src).not.toMatch(/\bnum\(/);
  });
});

describe('export file names', () => {
  it('punctuation in a company name never leaves a doubled, leading or trailing underscore', () => {
    expect(fileStem('HASBRO, INC.')).toBe('HASBRO_INC');
    expect(`${fileStem('HASBRO, INC.')}_LBO_model.xlsx`).toBe('HASBRO_INC_LBO_model.xlsx');
    expect(fileStem('  Électricité de France S.A. ')).toBe('Électricité_de_France_S_A');
    expect(fileStem('Smith & Nephew plc')).toBe('Smith_Nephew_plc');
    expect(fileStem('...')).toBe('deal');
  });
});

describe('no dark screen while the deal engine loads', () => {
  it('the page behind the deal engine is the deal engine paper colour', () => {
    const app = readFileSync(join(ROOT, 'App.tsx'), 'utf8');
    const paper = /--de-paper:\s*(#[0-9A-Fa-f]{6})/.exec(readFileSync(join(ROOT, 'index.css'), 'utf8'))![1];
    expect(app).toContain(`isDealEngine ? 'bg-[${paper}]'`);
  });
});
