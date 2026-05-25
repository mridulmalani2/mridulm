import React from 'react';
import { useDealEngineStore } from '../../../store/dealEngine';
import { fmtPct, fmtCurrency, irrColor } from '../../../lib/formatters';

/**
 * Fund-level (LP-facing) returns — surfaces the P4-2 overlay computed in
 * `lib/engine/fundReturns.ts`. Renders only when the deal has fund_assumptions
 * configured (fund_returns present). Net returns are after management fees and
 * carried interest over the preferred return; the deal-level (sponsor) IRR/MOIC
 * shown in the Returns card are unchanged by this overlay.
 */
const FundReturnsPanel: React.FC = () => {
  const ms = useDealEngineStore((s) => s.modelState);
  if (!ms || !ms.fund_returns || !ms.fund_assumptions) return null;

  const fr = ms.fund_returns;
  const fa = ms.fund_assumptions;
  const currency = ms.currency ?? 'GBP';

  const labelCls = 'text-[10px] tracking-widest uppercase';
  const labelStyle = { color: 'rgba(17,17,17,0.35)', fontFamily: "'JetBrains Mono', monospace" };
  const valStyle = { color: '#111111', fontFamily: "'JetBrains Mono', monospace" };

  const metric = (label: string, value: string) => (
    <div>
      <div className="text-lg font-semibold mb-0.5" style={valStyle}>{value}</div>
      <div className={labelCls} style={labelStyle}>{label}</div>
    </div>
  );

  return (
    <div className="p-5 mb-3" style={{ background: '#ffffff', border: '1px solid rgba(17,17,17,0.1)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
          Fund-Level Returns (LP, net of fees &amp; carry)
        </span>
        <span
          className="text-[9px] px-1.5 py-0.5 tracking-wider uppercase"
          style={{ color: 'rgba(17,17,17,0.45)', border: '1px solid rgba(17,17,17,0.12)', fontFamily: "'JetBrains Mono', monospace" }}
          title="Carry waterfall convention used for the net LP returns"
        >
          {fa.carry_waterfall} · {fmtPct(fa.carry_rate)} carry · {fmtPct(fa.preferred_return)} pref
        </span>
      </div>

      {/* Hero: Net IRR */}
      <div className="mb-5">
        <span className="font-playfair text-4xl font-bold mb-1 block" style={{ color: irrColor(fr.net_irr) }}>
          {fr.net_irr != null ? fmtPct(fr.net_irr) : 'N/C'}
        </span>
        <div className="text-[11px]" style={{ color: 'rgba(17,17,17,0.4)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
          Net IRR (LP)
          {fr.gross_to_net_spread != null && (
            <span title="Gross-to-net spread = deal (gross) IRR − net LP IRR. The fee + carry drag.">
              {' · '}gross-to-net {fmtPct(fr.gross_to_net_spread)}
            </span>
          )}
        </div>
      </div>

      {/* Net vs gross multiples */}
      <div className="grid grid-cols-3 gap-4" style={{ borderTop: '1px solid rgba(17,17,17,0.08)', paddingTop: 16 }}>
        {metric('Net MOIC', `${fr.net_moic.toFixed(2)}x`)}
        {metric('Gross IRR', fr.gross_irr != null ? fmtPct(fr.gross_irr) : 'N/C')}
        {metric('Gross MOIC', `${fr.gross_moic.toFixed(2)}x`)}
      </div>

      {/* Fee / carry drag + LP cash */}
      <div className="grid grid-cols-3 gap-4 mt-3" style={{ borderTop: '1px solid rgba(17,17,17,0.08)', paddingTop: 12 }}>
        {metric('Mgmt Fees', fmtCurrency(fr.management_fees_total, currency))}
        {metric('Carried Interest', fmtCurrency(fr.carried_interest, currency))}
        {metric('Pref Shortfall', fmtCurrency(fr.preferred_return_shortfall, currency))}
      </div>
      <div className="grid grid-cols-3 gap-4 mt-3" style={{ borderTop: '1px solid rgba(17,17,17,0.08)', paddingTop: 12 }}>
        {metric('LP Paid-In', fmtCurrency(fr.lp_paid_in, currency))}
        {metric('LP Distributions', fmtCurrency(fr.lp_distributions, currency))}
        {metric('Fee Basis', fa.management_fee_basis)}
      </div>
    </div>
  );
};

export default FundReturnsPanel;
