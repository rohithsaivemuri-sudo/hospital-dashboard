// Writes the data-driven LaTeX of the project report into generated/: the relational schema (ch. 4),
// functional dependencies and keys (ch. 5), normal forms (ch. 6), CREATE TABLE listings, demo and
// query outputs (ch. 8) and the test-case table (ch. 10). Inputs: data/*.json (from the live schema
// and runs on hospital_db_test) and normal-forms.js. Usage: node gen/gen-tables.js
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(R, 'data/schema.json'), 'utf8'));
const NF = require('./normal-forms');
const out = path.join(R, 'generated');
fs.mkdirSync(out, { recursive: true });
const esc = (s) => String(s ?? 'NULL').replace(/\\/g, '\\textbackslash{}').replace(/([_&%#$])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}').replace(/[{}]/g, m => '\\' + m).replace(/→/g, '$\\to$').replace(/↛/g, '$\\not\\to$');
const write = (f, s) => fs.writeFileSync(path.join(out, f), s);
const base = d.tables.filter(t => t.type === 'BASE TABLE').map(t => t.name);
const cols = (t) => d.columns.filter(c => c.t === t).sort((a, b) => a.pos - b.pos);
const pk = (t) => d.indexes.find(i => i.t === t && i.name === 'PRIMARY').cols.split(',');
const isCtx = (f) => f.name.startsWith('fk_ctx_');
// Candidate keys: the primary key and every UNIQUE key that does not contain it (those are superkeys).
const candidateKeys = (t) => {
  const p = pk(t);
  const uks = d.indexes.filter(i => i.t === t && i.name !== 'PRIMARY' && !i.non_unique).map(i => i.cols.split(','))
    .filter(k => !p.every(c => k.includes(c)));
  return [p, ...uks];
};

// ---- chapter 4: relational schema
const order = Object.keys(NF);
if (order.length !== base.length || base.some(t => !NF[t])) throw new Error('normal-forms.js must list every table');
const schemaLines = order.map(t => {
  const p = pk(t);
  const fks = d.fks.filter(f => f.t === t && !isCtx(f));
  const parts = cols(t).map(c => {
    let s = esc(c.name);
    if (p.includes(c.name)) s = `\\underline{${s}}`;
    const f = fks.find(f => f.cols === c.name);
    if (f) s = `\\fk{${s}}{${f.rcols === c.name ? '' : esc(f.rt)}}`;
    if (c.gen) s += '\\gen';
    return s;
  });
  const uks = candidateKeys(t).slice(1).map(k => `(${k.map(esc).join(', ')})`);
  return `\\relation{${esc(t)}}{${parts.join(', ')}}${uks.length ? `{${uks.join('; ')}}` : '{}'}`;
});
write('relational-schema.tex', schemaLines.join('\n') + '\n');

// ---- chapter 5: FDs, candidate keys, prime and non-prime attributes
const fdRows = order.map(t => {
  const keys = candidateKeys(t);
  const prime = [...new Set(keys.flat())];
  const nonPrime = cols(t).filter(c => !prime.includes(c.name)).length;
  const fds = NF[t].fds.map(f => esc(f.replace(/ → every column/, ' → all attributes'))).join('; ');
  return `\\texttt{${esc(t)}} & ${fds} & ${keys.map(k => `\\{${k.map(esc).join(', ')}\\}`).join(', ')} & ${prime.map(esc).join(', ')} & ${nonPrime} \\\\`;
});
write('fd-table.tex', fdRows.join('\n') + '\n');

// ---- chapter 6: per-table normal forms (before -> now) and the tables kept outside BCNF
const nfName = (nf) => nf[3] === 'Y' ? 'BCNF' : nf[2] === 'Y' ? '3NF' : nf[1] === 'Y' ? '2NF' : '1NF';
const note = (t) => {
  const v = NF[t];
  if (nfName(v.before) !== nfName(v.nf)) return (v.nfWhy.match(/Decomposed \((A\d)\)/) || [])[1] ? `decomposed (${v.nfWhy.match(/Decomposed \((A\d)\)/)[1]})` : 'changed';
  if (v.nf[3] === 'N') return 'kept; Table~\\ref{tab:kept}';
  return 'keys only';
};
const nfCells = order.map(t => `\\texttt{${esc(t)}} & ${nfName(NF[t].before)} & ${nfName(NF[t].nf)} & ${note(t)}`);
const nfHalf = Math.ceil(nfCells.length / 2);
const nfRows = nfCells.slice(0, nfHalf).map((c, k) => `${c} & ${nfCells[k + nfHalf] || ' & & & '} \\\\`);
write('nf-summary.tex', nfRows.join('\n') + '\n');
const kept = order.filter(t => NF[t].nf[3] === 'N');
write('nf-kept.tex', kept.map(t => `\\texttt{${esc(t)}} & ${NF[t].fds.filter(f => !/every column/.test(f)).map(esc).join('\\newline ')} & ${(NF[t].enforced || []).map(e => esc(e.replace(/: \(/, ' ('))).join('\\newline ')} \\\\`).join('\n') + '\n');
console.log(`[tables] ${order.length} tables; ${kept.length} outside BCNF; before BCNF ${order.filter(t => NF[t].before[3] === 'Y').length}, now ${order.filter(t => NF[t].nf[3] === 'Y').length}`);

// ---- chapter 8: CREATE TABLE listings for six key tables
const KEY_TABLES = ['patients', 'encounters', 'admissions', 'prescription_items', 'medicine_batches', 'bill_items'];
for (const t of KEY_TABLES) {
  const sql = d.create[t].replace(/ AUTO_INCREMENT=\d+/, '').replace(/ ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci/, ' ENGINE=InnoDB')
    .replace(/_utf8mb4\\'/g, "'").replace(/\\'/g, "'");
  write(`create-${t}.sql`, sql + ';\n');
}

// ---- chapter 8: query outputs (q86.json) as small result tables
const Q = JSON.parse(fs.readFileSync(path.join(R, 'data/q86.json'), 'utf8'));
const cell = (v) => { let s = v === null ? 'NULL' : String(v); if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.slice(0, 16); return esc(s.length > 24 ? s.slice(0, 23) + '…' : s); };
for (const q of Q) {
  fs.writeFileSync(path.join(out, `${q.id}.sql`), q.sql.trim() + '\n');
  const tables = q.results.map(r => {
    if (!r.count) return '{\\scriptsize\\itshape (no rows)}';
    const shown = r.rows.slice(0, 5);
    return `{\\scriptsize\\setlength{\\tabcolsep}{2.5pt}\\begin{tabular}{${r.cols.map(() => 'l').join('')}}\\toprule\n${r.cols.map(c => `\\textbf{${esc(c)}}`).join(' & ')} \\\\\\midrule\n`
      + shown.map(row => r.cols.map(c => cell(row[c])).join(' & ') + ' \\\\').join('\n')
      + `\n\\bottomrule\\end{tabular}}${r.count > shown.length ? `\\\\[-1pt]{\\tiny\\itshape ${r.count} rows; first ${shown.length} shown}` : `\\\\[-1pt]{\\tiny\\itshape ${r.count} row${r.count > 1 ? 's' : ''}}`}`;
  });
  write(`${q.id}-out.tex`, tables.join('\\\\[4pt]\n') + '\n');
}
write('queries.tex', Q.map((q, i) => `\\query{${i + 1}}{${esc(q.cat)}}{${esc(q.purpose)}}{${q.id}}`).join('\n') + '\n');

// ---- chapter 10: test cases (t10.json)
const T = JSON.parse(fs.readFileSync(path.join(R, 'data/t10.json'), 'utf8'));
const short = (s) => esc(s.replace(/\(`hospital_db_test`\.`[a-z_]+`, CONSTRAINT `([a-z_0-9]+)`.*$/, '(constraint $1)').replace(/Cannot add or update a child row: a foreign key constraint fails /, 'FK fails ').replace(/ if it keeps happening.*$/, ''));
write('test-cases.tex', T.map(t => `${t.id} & ${esc(t.operation)} & ${esc(t.input)} & ${esc(t.expected)} & ${short(t.actual)} & ${t.status} \\\\`).join('\n') + '\n');
console.log(`[tables] ${Q.length} queries, ${T.length} test cases (${T.filter(t => t.status === 'Pass').length} pass)`);

// ---- chapter 8.3-8.5: sample contents (demo8.json) and the admission trigger body
const DEMO = JSON.parse(fs.readFileSync(path.join(R, 'data/demo8.json'), 'utf8'));
const small = (rows) => `{\\scriptsize\\setlength{\\tabcolsep}{3pt}\\begin{tabular}{${Object.keys(rows[0]).map(() => 'l').join('')}}\\toprule\n${Object.keys(rows[0]).map(c => `\\textbf{${esc(c)}}`).join(' & ')} \\\\\\midrule\n`
  + rows.map(r => Object.values(r).map(cell).join(' & ') + ' \\\\').join('\n') + '\n\\bottomrule\\end{tabular}}';
for (const k of ['patients', 'departments', 'beds']) write(`demo-${k}.tex`, small(DEMO[k]) + '\n');
const trig = d.triggers.find(t => t.name === 'after_admission_insert');
write('trigger-admission.sql', `CREATE TRIGGER after_admission_insert AFTER INSERT ON admissions FOR EACH ROW\n${trig.body.trim()}\n`);
