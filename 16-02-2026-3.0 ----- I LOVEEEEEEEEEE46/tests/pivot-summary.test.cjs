// A PIVOT IS ARGUED WITH REAL OVERLAP, NOT A BORROWED TITLE.
//
// Applying to a role you have not held is normal and worth doing well.
// What sinks it is opening the summary with the posting's title as
// though it were already yours. A real generated CV opened:
//
//   "Experienced Manager of Clinical Services with a strong background
//    in clinical pharmacy leadership and operational excellence."
//
// over a history of Meta / Accenture / Citigroup software and data work.
// A recruiter in that field discards it on the first line, because the
// claim is contradicted three inches down the same page -- and the
// candidate never gets read, including the parts that genuinely WERE
// relevant (HIPAA-compliant systems, clinical model validation,
// mentoring, stakeholder reporting).
//
// So this rewrites rather than warns. The user's point, in their words:
// this is a tailoring extension, not a warning system.
//
// Two moves, both checkable against the document itself: a title
// asserted in the opening that appears nowhere in the employment history
// is replaced with the candidate's actual most recent title, and a
// "background in X" clause that nothing else in the CV supports is
// dropped. It deliberately does NOT invent a replacement -- building the
// evidenced bridge sentence is the model's job under RULE 1b. This is
// the floor: the CV never opens by claiming to be something the rest of
// it contradicts.
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

// The first non-empty line under the summary heading. Read by INDEX
// before, which broke the moment a role headline was added under the
// name: every line below shifted by one and the assertions started
// grading the heading itself. Content, not position.
const summaryLine = (text) => {
  const ls = String(text).split('\n');
  const h = ls.findIndex((l) => /^\s*(PROFESSIONAL\s+SUMMARY|SUMMARY|PROFILE)\s*:?\s*$/i.test(l));
  if (h === -1) return '';
  for (let i = h + 1; i < ls.length; i++) if (ls[i].trim()) return ls[i];
  return '';
};


const cvWith = (summary) => ['Maxmilliam Okafor', '', 'PROFESSIONAL SUMMARY', summary, '',
  'PROFESSIONAL EXPERIENCE',
  'Meta', 'Software Engineer\tJanuary 2023 - Present',
  '- Mentored junior engineers through pairing and design reviews.',
  '', 'SolimHealth', 'AI Product Manager\tAugust 2022 - December 2022',
  '- Built a HIPAA-compliant data-governance layer over PostgreSQL, keeping the platform audit-ready.',
  '', 'EDUCATION', 'MSc Artificial Intelligence'].join('\n');
const run = (summary, jdTitle) => {
  const out = RA.runRecruiterAudit({ cvText: cvWith(summary), jdText: 'clinical pharmacy leadership',
    jdTitle, jobKeywords: ['clinical'] });
  return { line: summaryLine(out.cvText), fixes: out.report.fixes };
};

// The exact sentence from the real generated CV.
const REAL = 'Experienced Manager of Clinical Services with a strong background in '
  + 'clinical pharmacy leadership and operational excellence. Experience enhancing '
  + 'patient outcomes through clinical service models and effective team management.';

console.log('THE BORROWED TITLE IS REPLACED WITH THE REAL ONE');
{
  const r = run(REAL, 'Manager of Clinical Services');
  t('  the posting\'s title is gone from the opening',
    !/Manager of Clinical Services/.test(r.line), r.line);
  t('  the candidate\'s actual title is there instead',
    /Software Engineer/.test(r.line), r.line);
  t('  not the company name', !/^Experienced Meta/.test(r.line),
    'the role line carries the dates; a company sits on its own line');
  t('  the unsupported "background in" clause is dropped',
    !/background in clinical pharmacy/i.test(r.line), r.line);
  t('  and the change is reported as a fix, not a warning',
    r.fixes.some((f) => /borrowed title/.test(f)), JSON.stringify(r.fixes));
  t('  the line still reads as a sentence',
    /^[A-Z]/.test(r.line.trim()) && !/\s{2,}|\.\./.test(r.line), JSON.stringify(r.line));
}

console.log('\nBUT A TITLE THE HISTORY DOES CONTAIN IS LEFT ALONE');
// Claiming a title you have held is not a pivot and not a problem.
{
  const honest = 'Experienced Software Engineer with a strong background in Python and mentoring.';
  const r = run(honest, 'Software Engineer');
  t('  the summary is untouched', r.line === honest, r.line);
  t('  and nothing is reported', !r.fixes.some((f) => /borrowed title/.test(f)),
    JSON.stringify(r.fixes));
}

console.log('\nTHE REPLACEMENT LANDS ON A WORD, NOT INSIDE ONE');
// Found in a generated CV, on the opening line: a posting titled
// "Manufacturing Engineer" matched inside "Manufacturing engineering
// technician", and the summary went out reading "Senior Software
// Engineering technician with a foundation in process optimisation".
// The claim was honest to begin with -- a technician is not an engineer,
// and the sentence never borrowed the title -- so the rewrite had
// nothing to fix and broke the sentence instead.
{
  const r = run('Manufacturing engineering technician with a foundation in process '
    + 'optimisation, quality assurance and documentation.', 'Manufacturing Engineer');
  t('  a longer word containing the title is left whole',
    /Manufacturing engineering technician/.test(r.line), r.line);
  t('  no word is cut in half',
    !/\bing technician/.test(r.line.replace(/engineering technician/, '')), r.line);
}
{
  // And the real claim is still caught: same title, actually asserted.
  const r = run('Experienced Manufacturing Engineer with a foundation in process optimisation.',
    'Manufacturing Engineer');
  t('  the title asserted as the candidate\'s own is still replaced',
    !/Manufacturing Engineer\b/.test(r.line) && /Software Engineer/.test(r.line), r.line);
}

console.log('\nAND IT DOES NOT IMPORT THE EMPLOYMENT TYPE');
// The real title is read off the role line, which still carries
// "(Contract, part-time)" at this point -- a later pass moves it into
// the first bullet. A summary opening "Senior Software Engineer
// (Contract, part-time) with a background in..." announces part-time in
// the first six words of the CV. The headline pass under the name
// strips it for exactly this reason; this one did not.
{
  const cv = ['Maxmilliam Okafor', '', 'PROFESSIONAL SUMMARY',
    'Experienced Manager of Clinical Services with a strong background in clinical pharmacy.', '',
    'PROFESSIONAL EXPERIENCE',
    'Meta', 'Senior Software Engineer (Contract, part-time)', 'January 2023 - Present',
    '- Mentored junior engineers through pairing and design reviews.', '',
    'EDUCATION', 'MSc Artificial Intelligence'].join('\n');
  const out = RA.runRecruiterAudit({ cvText: cv, jdText: 'clinical',
    jdTitle: 'Manager of Clinical Services', jobKeywords: ['clinical'] });
  const line = summaryLine(out.cvText);
  t('  the real title reaches the summary', /Senior Software Engineer/.test(line), line);
  t('  without the employment-type parenthetical',
    !/\(Contract/i.test(line) && !/part-time/i.test(line), line);
}

console.log('\nAND A SUPPORTED CLAIM SURVIVES');
// Tolerance matters as much as the guard: dropping evidenced material
// would make the CV weaker, which is the opposite of tailoring.
{
  const supported = 'Experienced Manager of Clinical Services with a strong background in '
    + 'HIPAA-compliant data-governance and mentoring engineers.';
  const r = run(supported, 'Manager of Clinical Services');
  t('  the evidenced clause is kept', /HIPAA/i.test(r.line), r.line);
  t('  while the borrowed title is still replaced',
    /Software Engineer/.test(r.line) && !/Manager of Clinical Services/.test(r.line), r.line);
}

console.log('\nAND IT NEVER RUNS WITHOUT SOMETHING TO CHECK AGAINST');
{
  const noExp = ['Name', '', 'PROFESSIONAL SUMMARY', REAL, '', 'EDUCATION', 'MSc AI'].join('\n');
  const out = RA.runRecruiterAudit({ cvText: noExp, jdText: 'x',
    jdTitle: 'Manager of Clinical Services', jobKeywords: ['clinical'] });
  t('  no employment history means no rewrite',
    /Manager of Clinical Services/.test(out.cvText),
    'with nothing to contradict the claim there is no basis to change it');
}
{
  const r = run(REAL, '');
  t('  no job title means no rewrite', /Manager of Clinical Services/.test(r.line), r.line);
}

console.log('\nAND THE REST OF THE CV IS NOT TOUCHED');
{
  const out = RA.runRecruiterAudit({ cvText: cvWith(REAL), jdText: 'clinical',
    jdTitle: 'Manager of Clinical Services', jobKeywords: ['clinical'] });
  t('  the experience bullets survive verbatim',
    /Mentored junior engineers through pairing and design reviews\./.test(out.cvText)
      && /HIPAA-compliant data-governance layer over PostgreSQL/.test(out.cvText),
    'the rewrite must be confined to the summary');
  t('  the employment history is intact',
    /Meta/.test(out.cvText) && /SolimHealth/.test(out.cvText), out.cvText.slice(0, 300));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
