// THE TAILORING WAS WRITING FICTION ONTO TRUE ACCOMPLISHMENTS.
//
// Asked whether the JD keywords are being tailored into the CV bullets
// correctly. Run on real Citigroup bullets with ten posting keywords
// the CV lacked, fastKeywordInjection produced:
//
//   "Rebuilt the credit risk reporting suite in SQL and Python for a
//    GBP 2.6bn consumer lending portfolio, replacing four conflicting
//    sources with a single agreed set of exposure figures, USING
//    SALESFORCE."
//   "Redesigned the grouping and scoring of anti money laundering
//    alerts in Python, cutting the volume of false alerts without
//    missing genuine cases, WITH WORKDAY."
//   "Led the analysis behind the IFRS 9 staging criteria review,
//    testing it across four years of loan performance data, USING
//    SNOWFLAKE."
//
// and a summary reading "Core skills include dbt, Looker, Jira".
//
// The candidate has never used any of those tools. Every one of the ten
// was injected, including the seven the profile does not mention at
// all, because "missing" was read as "add it" rather than as a question
// about whether they have it.
//
// TWO SEPARATE FAULTS.
//
//   A BULLET IS A CLAIM ABOUT A SPECIFIC PIECE OF WORK. A tool appended
//   to one asserts the tool was used FOR THAT WORK, which is a stronger
//   and more checkable claim than listing it under skills. It also
//   survives to the interview, where "tell me about the Salesforce side
//   of the credit risk rebuild" has no answer. And three bullets on a
//   page ending in ", using X." is a recognised stuffing pattern. The
//   tailoring prompt already forbids exactly this; the model obeyed it
//   and this code undid the work afterwards.
//
//   "MISSING" MEANT TWO DIFFERENT THINGS. Either the candidate has the
//   skill and the tailoring dropped it -- true, and worth restoring --
//   or they have never touched it. Nothing distinguished them, so both
//   were added. The profile is what distinguishes them: it is the
//   candidate's own record of what they have done.
//
// A keyword left off a CV costs a match. A keyword invented onto one
// costs the application and the reputation.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');

// Lift the two methods out of the popup class and run them for real.
const lift = (signature, name) => {
  const start = src.indexOf(signature);
  if (start === -1) return null;
  let d = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { end = i + 1; break; } }
  }
  const body = src.slice(start, end).replace(/^\s*[A-Za-z_]+/, 'function ' + name);
  return new Function('return (' + body + ')')();
};
const inject = lift('  fastKeywordInjection(cvText, keywords, missingKeywords) {', 'inject');
const evidenceOf = lift('  _profileEvidenceBlob() {', 'evidence');
if (!inject || !evidenceOf) {
  console.log('  FAIL  could not lift the injector out of popup.js');
  process.exit(1);
}

const PROFILE = {
  skills: ['SQL', 'Python', 'Power BI', 'Tableau', 'Airflow', 'Excel', 'Forecasting',
    'Stakeholder Management', 'Process Improvement'],
  professional_experience: [{
    company: 'Citigroup', title: 'Data Analyst',
    description: 'Credit risk reporting, anti money laundering alerts, IFRS 9 staging '
      + 'criteria, regulatory data feeds, requirements from nine stakeholder groups.',
  }],
};
const ctx = { _cachedProfile: PROFILE, _profileEvidenceBlob: evidenceOf };

const BULLETS = [
  '- Rebuilt the credit risk reporting suite in SQL and Python for a GBP 2.6bn consumer '
    + 'lending portfolio, replacing four conflicting sources with a single agreed set of '
    + 'exposure figures.',
  '- Replaced a 40 tab Excel reporting pack with a Power BI and Tableau suite, cutting the '
    + 'month end reporting cycle from nine working days to three.',
  '- Redesigned the grouping and scoring of anti money laundering alerts in Python, cutting '
    + 'the volume of false alerts without missing genuine cases.',
  '- Automated the daily regulatory data feed using Airflow and SQL Server after three late '
    + 'submissions in a single year.',
  '- Led the analysis behind the IFRS 9 staging criteria review, testing it across four '
    + 'years of loan performance data.',
  '- Trained 24 analysts across the London and Belfast offices in SQL and Power BI, '
    + 'reducing turnaround on routine data requests to same day.',
];
const CV = ['Maxmilliam Okafor', 'Data Analyst', 'Dublin, IE | maxokafordev@gmail.com', '',
  'PROFESSIONAL SUMMARY', 'Analyst with five years in data analysis and process improvement.', '',
  'PROFESSIONAL EXPERIENCE', 'Citigroup', 'London, United Kingdom', 'Data Analyst',
  'August 2017 - March 2021', ...BULLETS, '',
  'TECHNICAL SKILLS', 'SQL, Python, Power BI, Tableau, Airflow, Excel', '',
  'EDUCATION', 'Imperial College London'].join('\n');

// Seven the profile has never heard of, three it evidences.
const INVENTED = ['Salesforce', 'Workday', 'Snowflake', 'dbt', 'Looker', 'Jira',
  'incident management'];
const REAL = ['forecasting', 'stakeholder management', 'process improvement'];
const MISSING = INVENTED.concat(REAL);

const out = inject.call(ctx, CV, { all: MISSING }, MISSING);
const bulletsOf = (text) => text.split('\n').filter((l) => /^\s*[-•*]/.test(l));

console.log('NOTHING IS APPENDED TO A BULLET, EVER');
{
  const got = bulletsOf(out.tailoredCV);
  t('  every bullet survives', got.length === BULLETS.length, got.length + ' of ' + BULLETS.length);
  t('  and not one is altered', got.every((b, i) => b === BULLETS[i]),
    JSON.stringify(got.filter((b, i) => b !== BULLETS[i])));
  for (const tail of [/, using /i, /, with [A-Z]/, / via /i, / built with /i, /,\s*demonstrating /i]) {
    t('  no "' + String(tail) + '" tail appears', !got.some((b) => tail.test(b)),
      JSON.stringify(got.filter((b) => tail.test(b))));
  }
  for (const tool of INVENTED) {
    t('  "' + tool + '" reaches no bullet',
      !got.some((b) => b.toLowerCase().indexOf(tool.toLowerCase()) !== -1),
      JSON.stringify(got.filter((b) => b.toLowerCase().indexOf(tool.toLowerCase()) !== -1)));
  }
}

console.log('\nAND A TOOL THE PROFILE NEVER MENTIONS REACHES NOTHING AT ALL');
for (const tool of INVENTED) {
  t('  "' + tool + '" is nowhere on the CV',
    out.tailoredCV.toLowerCase().indexOf(tool.toLowerCase()) === -1,
    out.tailoredCV.split('\n').filter((l) => l.toLowerCase().indexOf(tool.toLowerCase()) !== -1).join(' / '));
}
t('  none of them is reported as injected',
  !out.injectedKeywords.some((k) => INVENTED.some((v) => v.toLowerCase() === String(k).toLowerCase())),
  JSON.stringify(out.injectedKeywords));

console.log('\nBUT A SKILL THE PROFILE DOES EVIDENCE IS STILL SURFACED');
// This is the legitimate half: the posting asked for it, the candidate
// has it, and the tailoring left it off. That is worth putting back.
for (const kw of REAL) {
  t('  "' + kw + '" reaches the CV',
    out.tailoredCV.toLowerCase().indexOf(kw.toLowerCase()) !== -1, kw);
}
t('  and it is reported as injected',
  REAL.every((k) => out.injectedKeywords.some((x) => String(x).toLowerCase() === k)),
  JSON.stringify(out.injectedKeywords));

console.log('\nAND THE SUMMARY IS NOT A LANDING SITE');
{
  // "Expertise includes X, Y." used to be appended here -- and the
  // audit clamps the summary to two lines moments later, so the
  // sentence was written and then deleted in the same run. Injection
  // must not touch the summary at all.
  const summaryLine = 'Analyst with five years in data analysis and process improvement.';
  t('  the summary line is byte-identical',
    out.tailoredCV.indexOf(summaryLine) !== -1, 'the summary was rewritten');
  for (const stuffing of [/Expertise includes/i, /Strong background in/i, /Core skills include/i]) {
    t('  no "' + String(stuffing) + '" sentence appears', !stuffing.test(out.tailoredCV),
      (out.tailoredCV.match(stuffing) || [''])[0]);
  }
}

console.log('\nA GROUPED SKILLS SECTION KEEPS ITS GROUPS');
{
  // The old merge split the whole section on commas and rejoined it as
  // ONE flat line -- "Programming: Python" welded, every label lost.
  const GROUPS = [
    'Languages & Citizenship: English (native), French (native) - EU Citizen',
    'Programming: Python, SQL',
    'Data & ML: Pandas, NumPy',
  ];
  const GCV = CV.replace('SQL, Python, Power BI, Tableau, Airflow, Excel', GROUPS.join('\n'));
  // "SQL" rides along evidenced AND already present inside a group, so
  // the dedupe has something real to catch.
  const o = inject.call(ctx, GCV, { all: REAL.concat(['SQL']) }, REAL.concat(['SQL']));
  for (const g of GROUPS) {
    t('  "' + g.slice(0, 28) + '..." survives byte-identical',
      o.tailoredCV.indexOf(g) !== -1, 'a group line was rewritten or flattened');
  }
  t('  the new keywords arrive on ONE new labelled line',
    /\nAdditional Skills: /.test(o.tailoredCV), 'no Additional Skills line');
  const aline = (o.tailoredCV.match(/^Additional Skills: (.*)$/m) || [])[1] || '';
  t('  ...carrying the evidenced keywords',
    REAL.every((k) => aline.toLowerCase().indexOf(k) !== -1), aline);
  t('  and a keyword already in a group is not added again',
    !/Additional Skills: .*\bSQL\b/i.test(o.tailoredCV)
      && !/Additional Skills: .*Python/i.test(o.tailoredCV), aline);
}

console.log('\nWITH NO PROFILE TO CHECK AGAINST, NOTHING IS ADDED');
{
  // The safe direction. An empty profile is not permission to invent.
  const blank = { _cachedProfile: null, _profileEvidenceBlob: evidenceOf };
  const o = inject.call(blank, CV, { all: MISSING }, MISSING);
  t('  no keyword is injected', o.injectedKeywords.length === 0,
    JSON.stringify(o.injectedKeywords));
  t('  and the bullets are untouched',
    bulletsOf(o.tailoredCV).every((b, i) => b === BULLETS[i]), 'a bullet changed');
}

console.log('\nAND THE METRICS IN THE BULLETS ARE ALL STILL THERE');
{
  const flat = bulletsOf(out.tailoredCV).join(' ');
  for (const n of ['2.6bn', '40 tab', 'nine working days', 'three', 'four years', '24 analysts']) {
    t('  "' + n + '" survives', flat.indexOf(n) !== -1, n);
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
