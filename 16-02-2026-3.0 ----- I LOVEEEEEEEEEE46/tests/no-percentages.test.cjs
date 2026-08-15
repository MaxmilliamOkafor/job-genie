// PERCENTAGES COME OUT. EVERY OTHER NUMBER STAYS.
//
// A percentage is the easiest figure to invent and the hardest for a
// reader to check: "by 40%" invites 40% of what, measured how, against
// what baseline. A reader who cannot answer discounts the bullet, and
// often the document with it. A scan of a real CV surfaced four
// "measurable results"; the two that read as genuine were "50+ legacy
// client applications" and "a full day to under two hours". The one that
// read as invented was the 40%.
//
// Removed even when the SOURCE supplied it. That is unusual -- elsewhere
// this codebase treats source figures as immutable -- and it is a
// deliberate exception, asked for by the person whose CV it is. The
// underlying facts are stronger anyway: "cut the manual review queue
// with no loss of precision across millions of daily users" says more
// than the percentage sitting on top of it did.
//
// The hard part is not the removal, it is leaving everything else alone:
// counts, durations, volumes and versions are the evidence worth
// keeping, and a pass this blunt could easily take them too.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
for (const f of ['content-quality-engine.js', 'recruiter-audit.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const RA = global.RecruiterAudit;
const run = (bullets) => {
  const cv = ['Max', '', 'PROFESSIONAL EXPERIENCE', 'Meta', 'Engineer\tJanuary 2023 - Present']
    .concat(bullets).concat(['', 'EDUCATION', 'MSc AI']).join('\n');
  const out = RA.runRecruiterAudit({ cvText: cv, jdText: 'python', jdTitle: 'Engineer',
    jobKeywords: ['Python'] });
  return { lines: out.cvText.split('\n').filter((l) => /^\s*[-•]/.test(l)), fixes: out.report.fixes };
};

console.log('EVERY SHAPE OF PERCENTAGE IS REMOVED');
[
  ['- Cut the review queue by 40% with no loss of precision.', 'by 40%'],
  ['- Delivered a 25% reduction in compute spend.', 'a 25% reduction'],
  ['- Made the pipeline 90% faster than before.', '90% faster'],
  ['- Improved throughput (35%) across the fleet.', '(35%)'],
  ['- Reduced errors by roughly 12.5% year on year.', 'roughly 12.5%'],
  ['- Raised coverage by 30 per cent.', '30 per cent'],
].forEach(([bullet, shape]) => {
  const got = run([bullet]).lines[0] || '';
  t('  ' + shape, !/\d+\s*(%|per\s?cent|percent)/i.test(got), got);
});

console.log('\nAND THE SENTENCE STILL READS');
[
  '- Cut the review queue by 40% with no loss of precision.',
  '- Delivered a 25% reduction in compute spend.',
  '- Made the pipeline 90% faster than before.',
].forEach((b) => {
  const got = run([b]).lines[0] || '';
  t('  no double spaces or stranded punctuation: ' + got.slice(0, 46),
    !/\s{2,}/.test(got) && !/\s[,.]/.test(got) && !/,\s*\./.test(got) && !/\bby\s*[.,]/.test(got), got);
});

console.log('\nBUT EVERY OTHER NUMBER SURVIVES');
// This is the half that matters. These are the figures a reader trusts.
const keep = [
  '- Led the migration of 50+ legacy client applications to Kubernetes.',
  '- Cut end-to-end processing from a full day to under two hours.',
  '- Served millions of daily users behind a REST API.',
  '- Shipped to 12 finance analysts across three trading desks.',
  '- Reduced month-end close from 9 days to 3.',
  '- Built on Python 3.11 with PyTorch 2.0 and 40 legacy reports migrated.',
];
// Compare by membership, not by index: the relevance reordering moves
// bullets around, which is a different pass doing its job.
const kept = run(keep).lines;
keep.forEach((b) => t('  ' + b.slice(2, 52), kept.includes(b),
  'not found verbatim in: ' + JSON.stringify(kept)));
t('  and nothing was reported as removed',
  !run(keep).fixes.some((f) => /percentage/i.test(f)), JSON.stringify(run(keep).fixes));

console.log('\nAND THE REMOVAL IS REPORTED');
const rep = run(['- Cut the queue by 40%.', '- Raised uptime by 15%.']);
t('  the fix names the count', rep.fixes.some((f) => /Removed percentage claims from 2 line/.test(f)),
  JSON.stringify(rep.fixes));
t('  and says the other figures were spared',
  rep.fixes.some((f) => /counts, durations and volumes were left untouched/.test(f)),
  JSON.stringify(rep.fixes));

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
