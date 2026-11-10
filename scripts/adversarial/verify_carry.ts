import { runModel } from '../../lib/engine2/facade';
import { GOLDEN_DEALS as G } from '../../tests/fixtures/engine2-golden-deals';
import { A } from './deals';
const run = (carry: number, cu: number) => runModel(G.G2.facts, { ...A, fund: { ...A.fund!, carry_pct: carry, catchup_pct: cu } }).fund!;
const f = run(0.2, 0.5);
const gp = f.gp_carry.reduce((s, x) => s + x, 0), lp = f.lp_distributions.reduce((s, x) => s + x, 0);
// profit above returned capital = everything distributed beyond paid-in; a COMPLETED catch-up leaves the GP at carry% of it
const profit = gp + lp - f.paid_in_total;
console.log('GP', gp.toFixed(4), 'profit above capital', profit.toFixed(4), 'GP share of profit', (gp / profit).toFixed(4), '(carry 20% ⇒ catch-up NOT complete if < 0.20)');
console.log('carry 0.20 vs 0.214 at 50% catch-up — GP', run(0.2, 0.5).gp_carry.join(','), '|', run(0.214, 0.5).gp_carry.join(','));
console.log('carry 0.20 vs 0.214 at 100% catch-up — GP', run(0.2, 1).gp_carry.map((x) => x.toFixed(3)).join(','), '|', run(0.214, 1).gp_carry.map((x) => x.toFixed(3)).join(','));
