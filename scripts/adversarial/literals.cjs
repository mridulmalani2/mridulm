const fs = require('fs'); const path = require('path');
const ts = require(path.join(__dirname, '../../node_modules/typescript'));
const dir = path.join(__dirname, '../../lib/engine2');
const files = [...fs.readdirSync(dir).map((f) => path.join(dir, f)), ...fs.readdirSync(path.join(dir, 'kernel')).map((f) => path.join(dir, 'kernel', f))]
  .filter((f) => f.endsWith('.ts') && !/workbook|disclosures|types\.ts$/.test(f));
const OK = new Set(['0', '1', '2', '-1']);
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const visit = (n) => {
    if (ts.isNumericLiteral(n) && !OK.has(n.text)) {
      // skip numbers inside template/string literals (messages) — those are never NumericLiteral nodes anyway
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
      const text = src.split('\n')[line].trim().slice(0, 150);
      console.log(`${path.relative(dir, f)}:${line + 1}  [${n.text}]  ${text}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
