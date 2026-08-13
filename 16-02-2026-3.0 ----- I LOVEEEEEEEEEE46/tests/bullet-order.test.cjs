// THE BULLETS THAT ANSWER THIS POSTING GO FIRST.
//
// Reviewers read the first three bullets of a role and stop. Bullets
// arrive in the order the source CV recorded them -- usually the order
// the work happened, which has nothing to do with the posting in hand.
//
// A real case: the strongest bullet for a Senior Technical Business
// Analyst posting was "Investigated trading-system anomalies with SQL
// and Pandas, built Tableau dashboards and presented root-cause findings
// and recommendations to VP-level stakeholders." That is business
// analysis, in business-analysis vocabulary, already written -- and it
// was the LAST bullet of the FOURTH role. Nobody reading top-down
// reaches it.
//
// This pass changes ORDER ONLY. Nothing is rewritten, nothing moves
// between roles, chronology is untouched. That is the point: of the
// levers that make an experience section more relevant, this is the only
// one with no fabrication risk whatsoever.
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

// The real Citigroup bullets, in their real source order.
const BULLETS = [
  '- Developed fraud and risk-scoring models in Python with scikit-learn and XGBoost over the daily transaction feed.',
  '- Re-engineered ETL workflows in SQL and Apache Airflow, cutting end-to-end processing from a full day to under two hours.',
  '- Automated monthly regulatory reporting with Python and Pandas, eliminating manual compilation.',
  '- Investigated trading-system anomalies with SQL and Pandas, built Tableau dashboards and presented root-cause findings and recommendations to VP-level stakeholders.',
];
const cvWith = (bullets) => ['Maxmilliam Okafor', '', 'PROFESSIONAL EXPERIENCE',
  'Citigroup', 'Data Analyst', 'August 2017 - March 2021'].concat(bullets)
  .concat(['', 'EDUCATION', 'MSc AI']).join('\n');
const run = (bullets, kws) => {
  const out = RA.runRecruiterAudit({
    cvText: cvWith(bullets), jdText: (kws || []).join(' '),
    jdTitle: 'Analyst', jobKeywords: kws || null,
  });
  return out.cvText.split('\n').filter((l) => /^\s*[-•]/.test(l)).map((l) => l.trim());
};

const BA = ['data profiling', 'stakeholder management', 'Tableau', 'dashboards', 'reporting', 'SQL'];
const ML = ['scikit-learn', 'XGBoost', 'machine learning', 'models', 'Python'];

console.log('THE MOST RELEVANT BULLET LEADS');
const forBA = run(BULLETS, BA);
t('  the stakeholder/dashboard bullet is first for a BA posting',
  /Investigated trading-system anomalies/.test(forBA[0]),
  'it was fourth in the source and is the strongest evidence for this role:\n              ' + forBA[0]);

console.log('\nAND A DIFFERENT POSTING GETS A DIFFERENT ORDER');
// If the order does not change with the posting, the pass is doing
// nothing useful -- that was the original complaint about tailoring.
const forML = run(BULLETS, ML);
t('  the modelling bullet leads for an ML posting',
  /fraud and risk-scoring models/.test(forML[0]), forML[0]);
t('  the two postings genuinely differ', forBA[0] !== forML[0],
  'same order for both means the posting is being ignored');

console.log('\nNOT ONE WORD IS REWRITTEN');
// This is what makes the pass safe. Reordering cannot fabricate.
t('  every bullet survives verbatim',
  BULLETS.every((b) => forBA.includes(b.trim())), JSON.stringify(forBA));
t('  none are lost', forBA.length === BULLETS.length, String(forBA.length));
t('  none are duplicated', new Set(forBA).size === forBA.length, JSON.stringify(forBA));

console.log('\nA BULLET THAT REFERS BACKWARDS NEVER LEADS');
// "Also, I..." as the first thing a reviewer reads is worse than a
// slightly less relevant opener.
const withBackref = [
  '- Automated monthly regulatory reporting with Python and Pandas.',
  '- Also built Tableau dashboards for stakeholder management and reporting.',
  '- Re-engineered ETL workflows in SQL and Apache Airflow.',
];
const backref = run(withBackref, BA);
t('  the "Also..." bullet is not promoted to first',
  !/^-\s*Also\b/i.test(backref[0]),
  'it scores highest on keywords but cannot open a role: ' + backref[0]);
t('  ...and is still present', backref.some((b) => /^-\s*Also\b/i.test(b)), JSON.stringify(backref));

console.log('\nAND IT LEAVES ALONE WHAT IT SHOULD');
t('  no keywords means no reordering',
  run(BULLETS, null)[0] === BULLETS[0].trim(), 'nothing to rank against');
t('  a two-bullet role is untouched',
  run(BULLETS.slice(0, 2), BA)[0] === BULLETS[0].trim(),
  'order cannot matter over two bullets, so do not churn the document');
// Equal relevance must keep the source order rather than shuffle.
const tied = ['- Built a thing in SQL.', '- Built another thing in SQL.', '- Built a third thing in SQL.'];
t('  equally relevant bullets keep their original order',
  JSON.stringify(run(tied, ['SQL'])) === JSON.stringify(tied),
  JSON.stringify(run(tied, ['SQL'])));

console.log('\nCHRONOLOGY BETWEEN ROLES IS NEVER TOUCHED');
// Reordering within a role is relevance. Reordering across roles would
// be a false employment history.
const twoRoles = ['Maxmilliam Okafor', '', 'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present',
  '- Shipped an ML model in Python.',
  '- Built Tableau dashboards for stakeholder management and reporting.',
  '- Wrote SQL for the data warehouse.',
  '', 'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  '- Investigated anomalies and presented to VP-level stakeholders using Tableau dashboards.',
  '- Automated reporting with Python.',
  '- Re-engineered ETL in SQL.',
  '', 'EDUCATION', 'MSc AI'].join('\n');
const out = RA.runRecruiterAudit({ cvText: twoRoles, jdText: BA.join(' '),
  jdTitle: 'Analyst', jobKeywords: BA }).cvText;
t('  Meta still comes before Citigroup',
  out.indexOf('Meta') < out.indexOf('Citigroup'), 'employment history was reordered');
t('  no bullet crossed between roles',
  out.indexOf('Wrote SQL for the data warehouse') < out.indexOf('Citigroup')
    && out.indexOf('Automated reporting with Python') > out.indexOf('Citigroup'),
  'a bullet moved to a job it did not belong to');

console.log('\nAND ONLY THE EXPERIENCE SECTION IS RANKED');
// An EDUCATION or CERTIFICATIONS list is in date order deliberately.
// Ranking it by keyword would put the BSc above the MSc.
const withEducation = ['Maxmilliam Okafor', '', 'PROFESSIONAL EXPERIENCE',
  'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  '- Automated reporting with Python.',
  '- Built Tableau dashboards for stakeholder management and reporting.',
  '- Re-engineered ETL in SQL.',
  '', 'EDUCATION',
  '- MSc Artificial Intelligence, 2022',
  '- BSc Computer Science with SQL and reporting coursework, 2018',
  '- Diploma in Tableau dashboards and stakeholder management, 2015',
  ''].join('\n');
const eduOut = RA.runRecruiterAudit({ cvText: withEducation, jdText: BA.join(' '),
  jdTitle: 'Analyst', jobKeywords: BA }).cvText;
const eduLines = eduOut.slice(eduOut.indexOf('EDUCATION'))
  .split('\n').filter((l) => /^\s*[-•]/.test(l)).map((l) => l.trim());
t('  the MSc still comes first despite scoring lowest on keywords',
  /^- MSc/.test(eduLines[0]), JSON.stringify(eduLines));
t('  the whole education list is in its original order',
  /BSc/.test(eduLines[1] || '') && /Diploma/.test(eduLines[2] || ''),
  JSON.stringify(eduLines));
t('  and experience was still ranked in the same document',
  /Tableau dashboards/.test((eduOut.split('EDUCATION')[0].split('\n')
    .filter((l) => /^\s*[-•]/.test(l))[0] || '')),
  'scoping to experience must not disable the pass entirely');

console.log('\nAND THE CHANGE IS REPORTED, NOT SILENT');
const rep = RA.runRecruiterAudit({ cvText: cvWith(BULLETS), jdText: BA.join(' '),
  jdTitle: 'Analyst', jobKeywords: BA }).report;
t('  the fix is named in the report',
  rep.fixes.some((f) => /Re-ordered bullets/.test(f)), JSON.stringify(rep.fixes));
t('  ...and says no wording changed',
  rep.fixes.some((f) => /no wording changed/.test(f)), JSON.stringify(rep.fixes));

console.log('\nA ROLE DOES NOT GET UNLIMITED BULLETS');
// Attention is finite and front-loaded. Recent roles get up to 6, older
// roles up to 4. Because this runs AFTER the ordering, what gets cut is
// the least relevant material -- so a different posting keeps a
// different subset, which is tailoring rather than loss.
const manyBullets = (n, prefix) => Array.from({ length: n },
  (_, k) => '- ' + prefix + ' task number ' + (k + 1) + ' delivered.');
const bigRole = (bullets) => ['Maxmilliam Okafor', '', 'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer', 'January 2023 - Present'].concat(bullets)
  .concat(['', 'EDUCATION', 'MSc AI']).join('\n');
const capped = (bullets, kws) => RA.runRecruiterAudit({
  cvText: bigRole(bullets), jdText: (kws || []).join(' '),
  jdTitle: 'Analyst', jobKeywords: kws || null,
}).cvText.split('\n').filter((l) => /^\s*[-•]/.test(l));

t('  the most recent role is capped at 6',
  capped(manyBullets(9, 'Widget'), ['widget']).length === 6,
  String(capped(manyBullets(9, 'Widget'), ['widget']).length));
t('  a role already within the cap is untouched',
  capped(manyBullets(5, 'Widget'), ['widget']).length === 5,
  'do not churn a document that was already fine');

// Older roles are held tighter. Role 3 onwards gets 4.
const threeRoles = ['Maxmilliam Okafor', '', 'PROFESSIONAL EXPERIENCE',
  'Meta', 'Engineer', 'January 2023 - Present', '- Recent one.', '- Recent two.',
  '', 'Stripe', 'Engineer', 'January 2021 - December 2022', '- Middle one.', '- Middle two.',
  '', 'Citigroup', 'Analyst', 'August 2017 - March 2021']
  .concat(manyBullets(7, 'Old'))
  .concat(['', 'EDUCATION', 'MSc AI']).join('\n');
const threeOut = RA.runRecruiterAudit({ cvText: threeRoles, jdText: 'old',
  jdTitle: 'Analyst', jobKeywords: ['old'] }).cvText;
const oldBullets = threeOut.slice(threeOut.indexOf('Citigroup'))
  .split('\n').filter((l) => /^\s*[-•]/.test(l));
t('  the third role is capped at 4', oldBullets.length === 4, String(oldBullets.length));
t('  the recent roles keep all of theirs',
  /Recent one/.test(threeOut) && /Recent two/.test(threeOut)
    && /Middle one/.test(threeOut) && /Middle two/.test(threeOut), 'a short role lost content');

console.log('\nBUT IT NEVER DROPS THE ONLY MENTION OF A KEYWORD');
// Trimming away a keyword match is the exact opposite of the point.
const soleCarrier = manyBullets(8, 'Routine')
  .concat(['- Ran the Kubernetes migration end to end.']);
const soleOut = capped(soleCarrier, ['Kubernetes', 'routine']);
t('  the sole Kubernetes bullet survives past the cap',
  soleOut.some((b) => /Kubernetes/.test(b)), JSON.stringify(soleOut));
t('  ...even though that puts the role over 6',
  soleOut.length === 7, String(soleOut.length) + ' (6 capped + 1 rescued)');

console.log('\nAND THE TRIM IS REPORTED');
const capRep = RA.runRecruiterAudit({ cvText: bigRole(manyBullets(9, 'Widget')),
  jdText: 'widget', jdTitle: 'Analyst', jobKeywords: ['widget'] }).report;
t('  the trim is named', capRep.fixes.some((f) => /Trimmed \d+ least-relevant/.test(f)),
  JSON.stringify(capRep.fixes));
t('  ...and says keywords were protected',
  capRep.fixes.some((f) => /sole mention of a posting keyword/.test(f)),
  JSON.stringify(capRep.fixes));

console.log('\nA WORD USED TWICE IN ONE BULLET IS FLAGGED, NOT REWRITTEN');
// The real bullet this came from: "surfacing fraud and risk exposure for
// the risk team". Fixing it needs to know what the team was called, and
// inventing a team name is worse than the repetition.
const repeatCv = ['Maxmilliam Okafor', '', 'PROFESSIONAL EXPERIENCE',
  'Citigroup', 'Data Analyst', 'August 2017 - March 2021',
  '- Surfacing fraud and risk exposure for the risk team.',
  '- Built Tableau dashboards for stakeholders.',
  '', 'EDUCATION', 'MSc AI'].join('\n');
const repOut = RA.runRecruiterAudit({ cvText: repeatCv, jdText: 'risk',
  jdTitle: 'Analyst', jobKeywords: ['risk'] });
const warn = (repOut.report.warnings || []).find((w) => w.kind === 'repeated-word-in-bullet');
t('  the repetition is reported', !!warn, JSON.stringify(repOut.report.warnings));
t('  it names the repeated word', !!warn && warn.samples[0].word === 'risk',
  JSON.stringify(warn && warn.samples));
t('  the bullet itself is left exactly as written',
  /Surfacing fraud and risk exposure for the risk team\./.test(repOut.cvText),
  'the text was rewritten, which requires facts this code does not have');
t('  the clean bullet is not flagged', !!warn && warn.count === 1, String(warn && warn.count));

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
