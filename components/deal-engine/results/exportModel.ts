/**
 * Build and download the Excel model (SPEC §26: a live formula model). A feature the formulas do
 * not cover BLOCKS the export by name; nothing is ever exported as pasted values. The analyst's
 * notes travel with the file as comments on the input cells and on their own sheet.
 */
import type { Workbook } from 'exceljs';
import type { Engine2ModelOutput } from '../../../lib/engine2/facade';
import { labelFor } from '../../../lib/engine2/draft';

export const fileStem = (name: string) => name.replace(/[^\w-]+/g, '_');

export function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const SCALAR_KEYS: Record<string, string> = {
  'entry.hold_years': 'hold', 'entry.basis': 'entry_basis', 'entry.enterprise_value': 'entry_ev', 'entry.entry_multiple': 'entry_mult',
  'fees.transaction_pct_of_ev': 'txn_pct', 'fees.financing_pct_of_commitments': 'fin_pct',
  'fees.monitoring.annual': 'mon_annual', 'fees.monitoring.termination_years': 'mon_T', 'fees.monitoring.discount_rate': 'mon_r',
  'structure.min_cash': 'min_cash', 'rollover_equity': 'rollover', 'structure.sweep.base_pct': 'sweep_pct', 'structure.sweep.grid.else_pct': 'sg_else',
  'covenants.rp_trap.level': 'rp_level', 'covenants.leverage_max': 'cov_lev', 'covenants.dscr_min': 'cov_dscr', 'covenants.fccr_min': 'cov_fccr',
  'covenants.springing.max': 'spr_max', 'covenants.springing.revolver_draw_trigger_pct': 'spr_trig',
  'operations.growth': 'g', 'operations.target_margin': 'target_margin', 'operations.margin_path': 'margin_path',
  'operations.da_pct_revenue': 'da_pct', 'operations.maint_capex_pct_revenue': 'capex_pct', 'operations.growth_capex': 'gcapex',
  'operations.lines.capex.pct': 'capex_da', 'operations.lines.year_n_plus_1_growth': 'gN1',
  'operations.nwc.pct_revenue': 'nwc_pct', 'operations.nwc.dso': 'dso', 'operations.nwc.dio': 'dio', 'operations.nwc.dpo': 'dpo',
  'structure.distributions': 'dist_req', 'structure.surplus_distribution.payout_pct': 'sd_payout', 'structure.surplus_distribution.start': 'sd_start',
  'tax.rate': 'tax_rate', 'tax.interest_deductible': 'int_ded', 'tax.s163j.applies': 's163j', 'tax.s163j.ati_pct': 'ati_pct', 'tax.s163j.ati_basis': 'ati_basis',
  'tax.nol.acquired_opening': 'nol_acq', 'tax.nol.acquired_usable': 'nol_usable', 'tax.nol.arose_pre_2018': 'nol_pre18', 'tax.nol.s382_annual_limit': 's382', 'tax.minimum_rate': 'min_tax',
  'exit.multiple': 'exit_mult', 'exit.basis': 'exit_basis', 'exit.fees_pct': 'exit_fee',
  'mip.pool_pct': 'mip_pool', 'mip.hurdle_moic': 'mip_hurdle', 'warrant.pct_of_ordinary': 'w_pct', 'warrant.strike_total': 'w_strike',
  'sweet_equity.sponsor_ordinary_pct': 'se_p', 'sweet_equity.loan_note_rate': 'se_r', 'sweet_equity.management_subscription': 'se_sub', 'sweet_equity.management_ordinary_pct': 'se_s0',
  'structure.selldown.year': 'sd_year', 'structure.selldown.fraction': 'sd_frac', 'structure.selldown.event_multiple': 'sd_mult',
  'fund.mgmt_fee_pct': 'f_fee', 'fund.fee_basis': 'f_basis', 'fund.committed_capital': 'f_commit', 'fund.pref_rate': 'f_pref', 'fund.carry_pct': 'f_carry',
  'fund.catchup_pct': 'f_cu', 'fund.waterfall': 'f_wf', 'fund.fee_offset_pct': 'f_off',
  'valuation.risk_free': 'rf', 'valuation.mrp': 'mrp', 'valuation.asset_beta': 'beta_a', 'valuation.debt_beta': 'beta_d', 'valuation.long_run_growth': 'g_lr',
  'valuation.terminal.capex_pct_of_da': 'term_capex', 'valuation.terminal.delta_nwc_before_growth': 'term_nwc', 'valuation.leverage_timing': 'timing',
};
const LINE_KEYS: Record<string, string> = { revenue: 'rev', ebitda: 'ebx', da: 'da', capex: 'capex', delta_nwc: 'dnwc' };
const TERM_FIELDS: Record<string, string> = {
  'size.x_ebitda': 'x', 'size.amount': 'amt', cash_coupon: 'cash', pik_coupon: 'pik', 'pricing.rate': 'rate', 'pricing.base_rate': 'base', 'pricing.floor': 'floor',
  'pricing.spread': 'spread', amort_pct_of_face: 'amort', oid_pct: 'oid', maturity_years: 'mat', elections: 'el',
};
const RCF_FIELDS: Record<string, string> = {
  'commitment.x_ebitda': 'rcf_x', 'commitment.amount': 'rcf_amt', 'pricing.rate': 'rcf_rate', 'pricing.base_rate': 'rcf_base', 'pricing.floor': 'rcf_floor',
  'pricing.spread': 'rcf_spread', commitment_fee: 'rcf_fee', maturity_years: 'rcf_mat',
};

/** The key of the Inputs-sheet row that holds an input, or null when the input has no row of its own there. */
export function inputRowKey(path: string, a: Engine2ModelOutput['assumptions']): string | null {
  if (SCALAR_KEYS[path]) return SCALAR_KEYS[path];
  const tr = /^structure\.tranches\.(\d+)\.(.+)$/.exec(path);
  if (tr) {
    const i = Number(tr[1]);
    const t = a.structure.tranches[i];
    if (!t) return null;
    if (t.type === 'revolver') return RCF_FIELDS[tr[2]] ?? null;
    // the workbook numbers the term facilities in order, leaving the revolver out
    const term = a.structure.tranches.slice(0, i).filter((x) => x.type !== 'revolver').length;
    return TERM_FIELDS[tr[2]] ? `t${term}_${TERM_FIELDS[tr[2]]}` : null;
  }
  const line = /^operations\.lines\.(\w+)\.(values|year1|growth)$/.exec(path);
  if (line && LINE_KEYS[line[1]]) return line[2] === 'values' ? LINE_KEYS[line[1]] : `${LINE_KEYS[line[1]]}_${line[2] === 'year1' ? 'y1' : 'g'}`;
  const tier = /^(structure\.sweep\.grid\.tiers|mip\.ratchet|sweet_equity\.ratchet)\.(\d+)\.(\w+)$/.exec(path);
  if (tier) {
    if (tier[1].startsWith('structure')) return `sg${tier[2]}_${tier[3] === 'pct' ? 'pct' : 'lev'}`;
    return `${tier[1].startsWith('mip') ? 'mip' : 'se'}_r${tier[2]}_${tier[3] === 'hurdle_moic' ? 'h' : 's'}`;
  }
  return null;
}

/**
 * Put the analyst's notes into the workbook: as a comment on the input's own cell on the Inputs
 * sheet where the input has one, and all of them on an "Analyst notes" sheet that says which cell
 * each belongs to. No formula reads either. Returns how many notes landed on a cell.
 */
export function attachNotes(wb: Workbook, inputRows: Record<string, number>, a: Engine2ModelOutput['assumptions'], notes: Record<string, string>): number {
  const entries = Object.entries(notes).filter(([, text]) => text.trim() !== '');
  if (!entries.length) return 0;
  const inputs = wb.getWorksheet('Inputs');
  let placed = 0;
  const where: Record<string, string> = {};
  for (const [path, text] of entries) {
    const key = inputRowKey(path, a);
    const row = key !== null ? inputRows[key] : undefined;
    if (!inputs || row === undefined) continue;
    // a single figure sits in column D; a by-year line starts in column E
    // (an input left as "none" has an empty cell in column D: the note still belongs there)
    const addr = [`D${row}`, `E${row}`].find((c) => { const v = inputs.getCell(c).value; return v !== null && v !== undefined && v !== ''; }) ?? `D${row}`;
    inputs.getCell(addr).note = { texts: [{ text: text.trim() }] };
    where[path] = `Inputs!${addr}`;
    placed += 1;
  }
  const ws = wb.addWorksheet('Analyst notes');
  ws.columns = [{ width: 4 }, { width: 58 }, { width: 16 }, { width: 90 }];
  ws.getCell('B1').value = 'Analyst notes on inputs';
  ws.getCell('B1').font = { bold: true, size: 12 };
  ws.getCell('B2').value = 'Where each number comes from, as recorded in the deal engine. Each note is also a comment on the cell named here. No formula reads this sheet.';
  ws.getCell('B4').value = 'Input';
  ws.getCell('C4').value = 'Cell';
  ws.getCell('D4').value = 'Note';
  ws.getRow(4).font = { bold: true };
  entries.forEach(([path, text], i) => {
    ws.getCell(`B${5 + i}`).value = labelFor(path).replace(/\s+—\s+/g, ', ');
    ws.getCell(`C${5 + i}`).value = where[path] ?? 'no single cell';
    ws.getCell(`D${5 + i}`).value = text.trim();
    ws.getCell(`D${5 + i}`).alignment = { wrapText: true, vertical: 'top' };
  });
  return placed;
}

/** Returns an error message, or null when the file was downloaded. */
export async function exportExcelModel(output: Engine2ModelOutput, notes: Record<string, string> = {}): Promise<string | null> {
  try {
    const { buildFormulaWorkbook, formulaCoverageBlockers } = await import('../../../lib/engine2/workbook');
    const missing = formulaCoverageBlockers(output);
    if (missing.length) return `The Excel model does not yet cover: ${missing.join(', ')}. Export is blocked rather than exporting pasted values.`;
    const { wb, inputRows } = buildFormulaWorkbook(output, { cachedResults: true });
    attachNotes(wb, inputRows, output.assumptions, notes);
    const buf = await wb.xlsx.writeBuffer();
    download(`${fileStem(output.facts.entity_name)}_LBO_model.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return null;
  } catch (e: unknown) {
    return `The export failed: ${(e as Error).message}`;
  }
}

/** Copy a table to the clipboard as tab-separated text, which pastes into Excel and PowerPoint as cells. */
export async function copyTable(table: HTMLTableElement): Promise<boolean> {
  const text = Array.from(table.rows)
    .map((r) => Array.from(r.cells).map((c) => (c.innerText ?? c.textContent ?? '').replace(/\s+/g, ' ').trim()).join('\t'))
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Save an SVG chart as an image file: SVG (vector, for slides) or PNG at twice the screen size. */
export async function saveChart(svg: SVGSVGElement, name: string, as: 'svg' | 'png'): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.getBoundingClientRect();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));
  // the charts take their colours from CSS variables; a saved file needs the resolved values
  const style = getComputedStyle(svg);
  const resolve = (v: string | null) => (v ?? '').replace(/var\((--[\w-]+)\)/g, (_m, n: string) => style.getPropertyValue(n).trim() || 'black');
  const src = Array.from(svg.querySelectorAll<SVGElement>('*'));
  Array.from(clone.querySelectorAll<SVGElement>('*')).forEach((el, i) => {
    for (const attr of ['fill', 'stroke', 'stop-color']) {
      const v = el.getAttribute(attr);
      if (v && v.includes('var(')) el.setAttribute(attr, resolve(v));
    }
    const cs = src[i] ? getComputedStyle(src[i]) : null;
    if (cs && el.tagName.toLowerCase() === 'text') {
      el.setAttribute('font-family', cs.fontFamily);
      el.setAttribute('font-size', cs.fontSize);
      if (!el.getAttribute('fill') || el.getAttribute('fill') === 'currentColor') el.setAttribute('fill', cs.fill !== 'none' ? cs.fill : cs.color);
    }
  });
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', style.getPropertyValue('--de-surface').trim() || 'white');
  clone.insertBefore(bg, clone.firstChild);
  const text = new XMLSerializer().serializeToString(clone);
  if (as === 'svg') { download(`${name}.svg`, text, 'image/svg+xml'); return; }
  const img = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  await new Promise<void>((done, fail) => { img.onload = () => done(); img.onerror = () => fail(new Error('chart could not be drawn')); img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width * 2); canvas.height = Math.round(box.height * 2);
  const ctx = canvas.getContext('2d');
  if (ctx) { ctx.scale(2, 2); ctx.drawImage(img, 0, 0, box.width, box.height); }
  URL.revokeObjectURL(url);
  await new Promise<void>((done) => canvas.toBlob((b) => { if (b) download(`${name}.png`, b, 'image/png'); done(); }, 'image/png'));
}
