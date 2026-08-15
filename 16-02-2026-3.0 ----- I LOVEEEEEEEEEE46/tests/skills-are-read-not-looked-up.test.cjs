// THE EXTENSION COULD NOT SEE 14 OF 17 SKILLS ON THE POSTING.
//
// universal-keyword-strategy found skills by intersecting the JD with
// closed lists: ROI_CLASSIFICATION.HIGH/MEDIUM/LOW and a 332-entry
// HARD_SKILLS that opens python, java, javascript. Measured against one
// real mechanical and industrial engineering posting, 14 of its 17 hard
// skills were absent from every list:
//
//   SolidWorks, AutoCAD, ISO 9001, lean manufacturing, CAD/CAM software,
//   time studies, process flow, quality control, quality standards,
//   technical reports, process design, mechanical engineering,
//   industrial engineering, manufacturing engineering.
//
// The one open path could not recover them either. `unclassified` splits
// the JD on whitespace, so it is SINGLE WORDS ONLY and every skill above
// is multi-word; what it returns is the top 15 words by raw frequency,
// which on any posting is filler.
//
// An extension that cannot SEE a skill cannot place it. This is upstream
// of every complaint about hard and soft skills missing from the CV, and
// no amount of prompt work downstream could have fixed it.
//
// THE FIX IS NOT A LONGER LIST.
//
// A list of skills is never finished, which is exactly how this one came
// to be all software. Soft skills ARE a bounded vocabulary and stay a
// list. Hard skills are unbounded, so instead of listing skills the
// extractor lists ~150 skill HEAD NOUNS -- the word that ends a skill
// phrase in any industry: analysis, control, engineering, standards,
// studies, assurance. "Root cause analysis" and "time studies" are
// caught by their last word whatever the industry, and head nouns are
// shared across industries in a way that skills are not.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
global.performance = global.performance || { now: () => Date.now() };
for (const f of ['jd-skill-extractor.js', 'universal-keyword-strategy.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}
const X = global.JDSkillExtractor;
const S = global.UniversalKeywordStrategy;
const JD = fs.readFileSync(path.join(DIR, 'tests/fixtures/jd-manufacturing.txt'), 'utf8');

// The exact terms a scanner reported for this posting.
const HARD = ['mechanical engineering', 'industrial engineering', 'root cause analysis',
  'quality standards', 'technical reports', 'cad/cam software', 'quality control',
  'process design', 'time studies', 'process flow', 'solidworks', 'autocad',
  'manufacturing engineering', 'lean manufacturing', 'quality assurance',
  'documentation', 'iso 9001'];
const SOFT = ['follow instructions', 'detail-oriented', 'process changes', 'consistent',
  'communication skills', 'analytical'];
const N = X._norm;
const missing = (want, got) => want.filter((w) => !new Set(got.map(N)).has(N(w)));

console.log('EVERY SKILL ON THE POSTING IS FOUND');
{
  const r = X.extractSkills(JD);
  const mh = missing(HARD, r.hardSkills);
  const ms = missing(SOFT, r.softSkills);
  t('  all 17 hard skills', mh.length === 0, 'missing: ' + mh.join(', '));
  t('  all 6 soft skills', ms.length === 0, 'missing: ' + ms.join(', '));
}

console.log('\nAND EACH SIGNAL CARRIES ITS OWN CASES');
{
  const r = X.extractHardSkills(JD);
  const has = (s) => r.some((x) => N(x) === N(s));
  t('  an internal capital finds a product  (SolidWorks)', has('SolidWorks'), r.join(' | '));
  t('  letters then digits find a standard  (ISO 9001)', has('ISO 9001'), r.join(' | '));
  t('  a head noun finds a phrase           (root cause analysis)',
    has('root cause analysis'), r.join(' | '));
  t('  ...whatever the industry             (time studies)', has('time studies'), r.join(' | '));
  // The backward walk is what makes the phrase the skill and not the
  // sentence: "Carry out time studies" must not arrive as a skill.
  t('  and it stops at the verb in front of it',
    !r.some((x) => /^(carry|lead|support|drive|maintain|present|produce)\b/i.test(x)),
    r.filter((x) => /^(carry|lead|support|drive|maintain|present|produce)\b/i.test(x)).join(', '));
  t('  and at a counting word',
    !r.some((x) => /^(one|two|three|several|many|multiple)\b/i.test(x)),
    r.filter((x) => /^(one|two|three|several|many|multiple)\b/i.test(x)).join(', '));
}

console.log('\nAND A SHORT NAME NEVER SUPPRESSES THE LONGER ONE');
// The acronym rule finds "ISO" and the head-noun walk finds "ISO 9001".
// Dropping the longer because a shorter prefixes it lost the standard.
{
  const r = X.extractHardSkills(JD);
  t('  ISO and ISO 9001 both survive',
    r.some((x) => N(x) === 'iso 9001'), r.join(' | '));
  t('  CAD/CAM and CAD/CAM software both survive',
    r.some((x) => N(x) === 'cad/cam software'), r.join(' | '));
}

console.log('\nAND IT IS WIRED INTO THE PIPELINE, NOT SITTING BESIDE IT');
// The extractor existed and changed nothing until this union.
{
  const r = S.extractAndClassifyKeywords(JD);
  const mh = missing(HARD, r.hardSkills);
  t('  the strategy returns all 17', mh.length === 0,
    'missing through the real entry point: ' + mh.join(', '));
  t('  and the soft skills too', missing(SOFT, r.softSkills).length === 0,
    'missing: ' + missing(SOFT, r.softSkills).join(', '));
  t('  the closed lists alone would have found almost none',
    [...S.HARD_SKILLS].filter((s) => JD.toLowerCase().includes(s)).length < 6,
    'the premise no longer holds; the list may have grown');
}

console.log('\nAND SOFTWARE POSTINGS DID NOT REGRESS');
// Unioned, not substituted: the closed lists are good for software roles
// and there was no reason to lose them.
{
  const swJD = 'Senior Backend Engineer. You will build services in Python and Go on '
    + 'Kubernetes and AWS, with PostgreSQL and Kafka. Experience with Terraform and '
    + 'CI/CD required. Strong communication skills and a collaborative approach.';
  const r = S.extractAndClassifyKeywords(swJD);
  const want = ['python', 'kubernetes', 'aws', 'postgresql', 'kafka', 'terraform'];
  const miss = want.filter((w) => !new Set(r.hardSkills.map(N)).has(N(w)));
  t('  the software vocabulary still lands', miss.length === 0, 'missing: ' + miss.join(', '));
  t('  and a soft skill is still classified soft',
    r.softSkills.some((s) => /communication/i.test(s)), r.softSkills.join(', '));
}

console.log('\nAND NOTHING IS INVENTED');
// It reads the posting. A term that is not in the JD must not appear.
{
  const r = X.extractHardSkills(JD);
  const low = JD.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ');
  const ghosts = r.filter((s) => low.indexOf(N(s)) === -1);
  t('  every term returned is present in the posting', ghosts.length === 0,
    'not in the JD: ' + ghosts.join(', '));
}

console.log('\nAND THE EXTRACTOR LOADS BEFORE THE STRATEGY THAT USES IT');
{
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const js = man.content_scripts[0].js;
  const a = js.indexOf('jd-skill-extractor.js');
  const b = js.indexOf('universal-keyword-strategy.js');
  t('  both are content scripts', a > -1 && b > -1, 'a=' + a + ' b=' + b);
  t('  and the extractor is first', a < b, 'a=' + a + ' b=' + b);
  t('  the popup loads it too',
    /jd-skill-extractor\.js/.test(fs.readFileSync(path.join(DIR, 'popup.html'), 'utf8')),
    'absent from popup.html');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
