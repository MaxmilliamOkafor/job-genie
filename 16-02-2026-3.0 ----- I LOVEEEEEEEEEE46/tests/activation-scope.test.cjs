// WHERE THE "ONLY AFTER YOU CLICK" RULE APPLIES.
//
// LinkedIn Easy Apply now requires the user to press Easy Apply before
// anything runs, because the automatic path was opening and SUBMITTING
// applications for roles the user was merely scrolling past.
//
// That rule must NOT have leaked onto the other ATS. There, automatic is
// the whole point: land on a Greenhouse or Workday posting and the
// extension should capture the JD, tailor, attach and prepare the
// follow-up without being asked. These assert the boundary in both
// directions, because a fix that quietly disabled 32 platforms would
// look exactly like a fix.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

const linkedin = read('linkedin-autofill.js');
const background = read('background.js');
const content = read('content.js');
const manifest = JSON.parse(read('manifest.json'));

// ---- 1. the rule exists, on LinkedIn -------------------------------
console.log('LINKEDIN: NOTHING WITHOUT A CLICK');
t('the automatic path returns unless a dialog is already open',
  /const open = findEasyApplyModal\(\);[\s\S]{0,200}?if \(!open\)[\s\S]{0,1400}?return;/.test(linkedin),
  'the auto path can still act with no dialog open');
// The guard must come before anything in the AUTOMATIC path that could
// press the button. Checked inside _run's body rather than by position in
// the file: runAutoFlow is declared earlier, so a file-order comparison
// says nothing.
const runBody = (() => {
  const i = linkedin.indexOf('function _run(reason)');
  return i === -1 ? '' : linkedin.slice(i, linkedin.indexOf('\n  }', i));
})();
t('the automatic path has a body to check', runBody.length > 100, String(runBody.length));
// Structural, not literal: the guard gained a trace call inside it, and a
// test that breaks when a log line is added is a test that gets deleted.
const guardAt = runBody.search(/if \(!open\)/);
t('the guard precedes the flow that can press Easy Apply',
  guardAt !== -1 && guardAt < runBody.indexOf('runAutoFlow('),
  'the automatic path can reach runAutoFlow without a dialog open');
t('and the guard actually returns',
  /if \(!open\)[\s\S]{0,1400}?return;/.test(runBody),
  'the guard does not stop the path');
t('the automatic path never calls openEasyApply itself',
  runBody.indexOf('openEasyApply') === -1,
  'the automatic path presses Easy Apply -- the reported bug');
// It stays available for the popup's explicit "Apply now", which IS a
// deliberate user action.
t('openEasyApply is still reachable from the explicit Apply-now path',
  /__JG_LINKEDIN_APPLY_NOW__/.test(linkedin) && /openEasyApply\(\)/.test(linkedin));
t('the results-list sweep is gone, not merely disabled',
  !/runListFlow|isResultsListPage|resultCards/.test(linkedin),
  'list-sweep code is still present and could be re-enabled by accident');
t('nothing clicks a job card',
  !/job-card-container__link/.test(linkedin) || !/\.click\(\)/.test(
    (/cardLink[\s\S]{0,400}/.exec(linkedin) || [''])[0]),
  'a job card click path still exists');
t('the debounce cannot be starved by a mutating page',
  /MAX_WAIT_MS/.test(linkedin),
  'a plain debounce never fires on LinkedIn, which never stops mutating');

// ---- 2. and it is scoped to LinkedIn alone --------------------------
console.log('\nSCOPE: LINKEDIN ONLY');
t('linkedin-autofill.js is registered for linkedin.com and nothing else',
  /const LINKEDIN_MATCHES = \['https:\/\/\*\.linkedin\.com\/\*'\];/.test(background),
  'the LinkedIn filler matches hosts beyond linkedin.com');
t('it is not a manifest content script on any host',
  !manifest.content_scripts.some((cs) => (cs.js || []).includes('linkedin-autofill.js')),
  'it would load somewhere the dynamic registration does not control');
for (const cs of manifest.content_scripts) {
  if (!(cs.js || []).includes('content.js')) continue;
  t('the tailoring engine does not load on linkedin.com',
    !cs.matches.some((m) => m.indexOf('linkedin.com') !== -1),
    'the heavy engine is denylisted there -- it crashes the SPA');
}

// ---- 3. the other ATS stay automatic --------------------------------
console.log('\nEVERY OTHER ATS: STILL AUTOMATIC');
t('content.js captures the posting on load, unprompted',
  /setTimeout\(\(\) => captureJobContext\('load'\), \d+\);/.test(content),
  'the JD would only be captured if something asked');
t('...and again once the page settles',
  /captureJobContext\('settle'\)/.test(content));
t('...and on SPA route changes',
  /captureJobContext\('spa'\)/.test(content));
t('auto-tailor is still driven by the page, not by a click',
  /autoTailorDocuments/.test(content) && !/requires a click/i.test(content),
  'tailoring became manual on every platform');
t('the attach loop still runs on its own',
  /attachLoop4ms = setInterval/.test(content));

// The engine must reach the ATS hosts. A count, so a wholesale removal
// is caught even if the selectors above still match.
const mainBlock = manifest.content_scripts.find((cs) => (cs.js || []).includes('content.js'));
t('the tailoring engine is registered on 100+ hosts',
  mainBlock && mainBlock.matches.length > 100,
  'matches: ' + (mainBlock ? mainBlock.matches.length : 'no block'));
for (const host of ['greenhouse.io', 'myworkdayjobs.com', 'smartrecruiters.com',
                    'workable.com', 'icims.com', 'teamtailor.com']) {
  t('  ' + host + ' still gets the engine',
    mainBlock.matches.some((m) => m.indexOf(host) !== -1));
}

// ---- 4. no dead references to the deleted sweep ---------------------
console.log('\nNO DEAD REFERENCES');
t('the popup no longer reports a list sweep that cannot happen',
  !/JG_LINKEDIN_LIST_RESULT|describeListResult/.test(read('popup.js')),
  'dead reporting for a removed feature');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
