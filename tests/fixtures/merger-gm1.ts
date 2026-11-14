/**
 * Golden GM1 inputs (SPEC §29.9): the reference M&A workbook's hard-coded cells, at full precision,
 * expressed through the general merger schema. No special-case switch: every reference convention is
 * an ordinary assumption setting.
 */
import type { MergerAssumptions, MergerFacts } from '../../lib/engine2/merger/types';

export const GM1_FACTS: MergerFacts = {
  acquirer: {
    entity_name: 'Buyer', currency: 'EUR', fiscal_year: 2023,
    year0: {
      revenue: 15000, ebitda: 2500, da: -600, net_interest: -141.66983739756503, nci: -191.21869570405514,
      other_cash_items: -250, delta_nwc: -35, capex: -780, other_items: -150, dividends: -506.39908682950136,
      nci_dividends: 0.35 * -191.21869570405514, debt: 6000, opening_cash: 1200,
    },
    shares: 950, share_price: 24, net_debt: null,
  },
  target: {
    entity_name: 'Target', currency: 'EUR', fiscal_year: 2023,
    year0: {
      revenue: 6000, ebitda: 1000, da: -252.00000000000003, net_interest: 0, nci: 0,
      other_cash_items: -50, delta_nwc: -22, capex: -320, other_items: -40, dividends: 0,
      nci_dividends: 0, debt: 0, opening_cash: 0,
    },
    shares: null, share_price: null, net_debt: 2500,
  },
};

export const GM1_ASSUMPTIONS: MergerAssumptions = {
  deal_name: 'GM1 reference',
  horizon_years: 3,
  standalone: {
    acquirer: {
      revenue_growth: [0.028, 0.031, 0.03], ebitda_margin: [0.166, 0.167, 0.168],
      da: [-616.8000000000001, -635.9208, -654.998424],
      net_interest: [-136.52349796181895, -131.09521943345345, -124.75747576021038],
      tax_rate: 0.28,
      nci: [-196.42717955416114, -205.25286254870966, -214.26532864491745], nci_payout: [0.35, 0.35, 0.35],
      other_cash_items: [-250, -250, -250], delta_nwc: [-33.6, -38.24159999999993, -38.15524800000003],
      capex_pct_revenue: [0.052, 0.053, 0.053], other_items: [-150, -150, -150], payout: [0.4, 0.4, 0.4],
      debt: [5800, 5600, 5400],
    },
    target: {
      revenue_growth: [0.042, 0.04, 0.041], ebitda_margin: [0.165, 0.166, 0.166],
      da: [-262.584, -273.08736, -284.28394176], net_interest: [0, 0, 0], tax_rate: 0.29,
      nci: [0, 0, 0], nci_payout: [0, 0, 0], other_cash_items: [-50, -50, -50],
      delta_nwc: [-23.226000000000077, -23.049040000000062, -24.57027663999994],
      capex_pct_revenue: [0.053, 0.054, 0.054], other_items: [-40, -40, -40], payout: [0, 0, 0], debt: [0, 0, 0],
    },
  },
  price: { driver: 'enterprise_value', enterprise_value: 8200 },
  target_debt: 'refinance_all',
  fees: { advisory: { basis: 'pct_equity_value', value: 0.02, treatment: 'not_recognised' } },
  funding: {
    acquisition_debt: { amount: 7759, rate: 0.04 },
    issue_price: 24,
    plug: 'equity',
    leverage_cap: { max: 3, test_year: 2 },
    solve: 'none',
  },
  synergies: { run_rate: 140, phasing: [1, 1, 1, 1] },
  adjustments_tax_rate: 0.3,
  interest_on_impact_cash: null,
  combined_dividends: { mode: 'acquirer_payout_on_group_income', ratio: [0.4, 0.4, 0.4] },
  year0_cash_carried: false,
};
