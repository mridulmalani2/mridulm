/**
 * Phase 1 — pure EDGAR client helpers (no network): CIK padding, EDGAR-URL parsing,
 * company-ticker fuzzy ranking, and flattening the column-oriented submissions payload.
 */

import { describe, it, expect } from 'vitest';
import {
  padCik, parseEdgarUrl, rankCompanyMatches, extractRecentFilings,
  type CompanyTickerEntry, type Submissions,
} from '../lib/edgar/client';

describe('padCik', () => {
  it('zero-pads numeric and string CIKs to the CIK########## form', () => {
    expect(padCik(320193)).toBe('CIK0000320193');
    expect(padCik('320193')).toBe('CIK0000320193');
    expect(padCik('CIK0000320193')).toBe('CIK0000320193'); // idempotent
    expect(padCik(1000000)).toBe('CIK0001000000');
  });
});

describe('parseEdgarUrl', () => {
  it('parses a browse-edgar CIK query param', () => {
    expect(parseEdgarUrl('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-K'))
      .toEqual({ cik10: 'CIK0000320193' });
  });
  it('parses an Archives data path with accession', () => {
    expect(parseEdgarUrl('https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm'))
      .toEqual({ cik10: 'CIK0000320193', accession: '0000320193-23-000106' });
  });
  it('parses a bare CIK and a bare number', () => {
    expect(parseEdgarUrl('CIK0000320193')).toEqual({ cik10: 'CIK0000320193' });
    expect(parseEdgarUrl('  320193 ')).toEqual({ cik10: 'CIK0000320193' });
  });
  it('returns null for non-EDGAR text', () => {
    expect(parseEdgarUrl('not a url')).toBeNull();
    expect(parseEdgarUrl('')).toBeNull();
  });
});

const TICKERS: CompanyTickerEntry[] = [
  { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  { cik_str: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' },
  { cik_str: 1652044, ticker: 'GOOGL', title: 'Alphabet Inc.' },
  { cik_str: 1018724, ticker: 'AMZN', title: 'AMAZON COM INC' },
  { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
];

describe('rankCompanyMatches', () => {
  it('ranks an exact ticker first', () => {
    const m = rankCompanyMatches(TICKERS, 'AAPL');
    expect(m[0].ticker).toBe('AAPL');
    expect(m[0].cik10).toBe('CIK0000320193');
  });
  it('matches by title prefix (case-insensitive)', () => {
    expect(rankCompanyMatches(TICKERS, 'micro')[0].ticker).toBe('MSFT');
    expect(rankCompanyMatches(TICKERS, 'apple')[0].title).toBe('Apple Inc.');
  });
  it('honours the limit and returns nothing for an empty query', () => {
    expect(rankCompanyMatches(TICKERS, 'inc', 2).length).toBeLessThanOrEqual(2);
    expect(rankCompanyMatches(TICKERS, '   ')).toEqual([]);
  });
});

describe('extractRecentFilings', () => {
  const subs: Submissions = {
    cik: '320193',
    name: 'Apple Inc.',
    filings: {
      recent: {
        accessionNumber: ['0000320193-23-000106', '0000320193-23-000077'],
        form: ['10-K', '10-Q'],
        filingDate: ['2023-11-03', '2023-08-04'],
        reportDate: ['2023-09-30', '2023-07-01'],
        primaryDocument: ['aapl-20230930.htm', 'aapl-20230701.htm'],
      },
    },
  };
  it('filters by form and builds canonical document URLs', () => {
    const tenKs = extractRecentFilings(subs, ['10-K']);
    expect(tenKs.length).toBe(1);
    expect(tenKs[0].form).toBe('10-K');
    expect(tenKs[0].documentUrl).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm');
    expect(tenKs[0].filingIndexUrl).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/');
  });
  it('returns all filings when no form filter is given', () => {
    expect(extractRecentFilings(subs).length).toBe(2);
  });
});
