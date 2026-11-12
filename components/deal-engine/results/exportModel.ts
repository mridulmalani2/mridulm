/**
 * Build and download the Excel model (SPEC §26: a live formula model). A feature the formulas do
 * not cover BLOCKS the export by name; nothing is ever exported as pasted values. The analyst's
 * notes travel with the file on their own sheet, which no formula reads.
 */
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

/** Returns an error message, or null when the file was downloaded. */
export async function exportExcelModel(output: Engine2ModelOutput, notes: Record<string, string> = {}): Promise<string | null> {
  try {
    const { buildFormulaWorkbook, formulaCoverageBlockers } = await import('../../../lib/engine2/workbook');
    const missing = formulaCoverageBlockers(output);
    if (missing.length) return `The Excel model does not yet cover: ${missing.join(', ')}. Export is blocked rather than exporting pasted values.`;
    const { wb } = buildFormulaWorkbook(output, { cachedResults: true });
    const entries = Object.entries(notes).filter(([, text]) => text.trim() !== '');
    if (entries.length) {
      const ws = wb.addWorksheet('Analyst notes');
      ws.columns = [{ width: 4 }, { width: 58 }, { width: 90 }];
      ws.getCell('B1').value = 'Analyst notes on inputs';
      ws.getCell('B1').font = { bold: true, size: 12 };
      ws.getCell('B2').value = 'Where each number comes from, as recorded in the deal engine. No formula reads this sheet.';
      ws.getCell('B4').value = 'Input';
      ws.getCell('C4').value = 'Note';
      ws.getRow(4).font = { bold: true };
      entries.forEach(([path, text], i) => {
        ws.getCell(`B${5 + i}`).value = labelFor(path);
        ws.getCell(`C${5 + i}`).value = text;
        ws.getCell(`C${5 + i}`).alignment = { wrapText: true, vertical: 'top' };
      });
    }
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
