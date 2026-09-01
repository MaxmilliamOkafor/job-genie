// "IT RANDOMLY AUTOFILLS" WAS NOT RANDOM. IT WAS A RACE.
//
// The vendor engine's kill switch read
//
//     window.__JG_AUTOFILL_DISABLED__ === true
//
// so an UNSET flag meant "allowed". The flag is written by
// autofill-controller.js after an ASYNC storage read; the vendor bundle
// is registered at document_idle. On every page load there was a window
// in which the flag was undefined and all 220+ vendor value writes were
// permitted -- whatever the toggle said, on whatever page was open.
//
// The whole control surface now fails CLOSED, at five layers:
//
//   1. the flag is true from the first statement of the controller,
//      before any await;
//   2. jg-gate blocks unless the flag is EXPLICITLY false, and reads
//      the toggle itself when no controller ever ran;
//   3. the gate opens in exactly one place -- the inject path, after
//      toggle + host + real-form eligibility have all been decided;
//   4. workday-handlers re-reads the stored toggle on every run instead
//      of trusting a snapshot that defaulted to ENABLED;
//   5. the service worker re-checks the toggle before injecting, so a
//      stale message cannot arm a page the user switched off.
//
// Turning the toggle off in the popup now also reaches tabs that are
// already open, which previously stayed armed until reloaded.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const gate = fs.readFileSync(path.join(DIR, 'autofill-engine', 'jg-gate.js'), 'utf8');
const ctl = fs.readFileSync(path.join(DIR, 'autofill-controller.js'), 'utf8');
const wd = fs.readFileSync(path.join(DIR, 'workday-handlers.js'), 'utf8');
const bg = fs.readFileSync(path.join(DIR, 'background.js'), 'utf8');

console.log('1. THE KILL SWITCH FAILS CLOSED');
{
  t('  the gate blocks unless the flag is explicitly false',
    /function disabled\(\)\s*\{\s*return window\.__JG_AUTOFILL_DISABLED__ !== false;/.test(gate),
    'an unset flag still permits vendor writes');
  t('  ...and "=== true" is gone from the predicate',
    !/return window\.__JG_AUTOFILL_DISABLED__ === true;/.test(gate),
    'the fail-open predicate survives');
  t('  the gate self-defaults to closed when no controller ran',
    /__JG_AUTOFILL_DISABLED__ === undefined\) \{\s*\n\s*window\.__JG_AUTOFILL_DISABLED__ = true;/.test(gate),
    'an uncontrolled frame starts open');
  t('  ...and opens itself only on a confirmed stored yes',
    /autofill_enabled === true && window\.__JG_AUTOFILL_DISABLED__ !== false/.test(gate),
    'the self-read can open the gate without confirming the toggle');
}

console.log('\n2. THE CONTROLLER IS CLOSED BEFORE ITS FIRST await');
{
  const head = ctl.slice(0, ctl.indexOf('const STORAGE_KEY'));
  t('  the flag is set true at the top of the file',
    /__JG_AUTOFILL_DISABLED__ === undefined\) window\.__JG_AUTOFILL_DISABLED__ = true;/.test(head),
    'the flag is unset until the async read returns');
  t('  init() closes it before reading storage',
    /async init\(\) \{[\s\S]{0,400}window\.__JG_AUTOFILL_DISABLED__ = true;[\s\S]{0,200}await this\._readEnabled\(\)/.test(ctl),
    'the read happens with the gate open');
  t('  and being enabled alone no longer opens it',
    !/this\.enabled = await this\._readEnabled\(\);\s*\n\s*window\.__JG_AUTOFILL_DISABLED__ = !this\.enabled;/.test(ctl),
    'an ineligible page with the toggle on is armed');
}

console.log('\n3. THE GATE OPENS IN EXACTLY ONE PLACE');
{
  const opens = (ctl.match(/__JG_AUTOFILL_DISABLED__ = false/g) || []).length;
  t('  precisely one line opens it', opens === 1, opens + ' lines set it false');
  t('  ...inside _requestInject', /_requestInject\([\s\S]{0,700}window\.__JG_AUTOFILL_DISABLED__ = false;/.test(ctl),
    'the opener is somewhere else');
  t('  guarded by the toggle and the denylist',
    /if \(!this\.enabled \|\| _isDeniedHost\(\)\) \{\s*\n\s*window\.__JG_AUTOFILL_DISABLED__ = true;/.test(ctl),
    'inject can open the gate on a denied host');
  t('  and toggling ON does not open it by itself',
    /if \(!this\.enabled\) window\.__JG_AUTOFILL_DISABLED__ = true;/.test(ctl),
    'setEnabled(true) arms every page');
}

console.log('\n4. A TOGGLE FLIPPED ELSEWHERE REACHES OPEN TABS');
{
  t('  the controller listens for the storage change',
    /storage\.onChanged\.addListener/.test(ctl) && /Toggle turned OFF elsewhere/.test(ctl),
    'open tabs stay armed until reloaded');
  t('  ...and tears the vendor down on OFF',
    /if \(!on\) \{[\s\S]{0,260}_teardownVendor\(\)/.test(ctl), 'the running vendor survives an OFF');
}

console.log('\n5. THE OTHER FILLERS FAIL CLOSED TOO');
{
  t('  workday-handlers no longer defaults to enabled',
    /enabled: false,/.test(wd) && !/const AutofillController = \{\s*\n\s*enabled: true,/.test(wd),
    'a run before init() fills the form');
  t('  ...and re-reads the toggle on every run',
    /async runAutofill\(\) \{[\s\S]{0,700}chrome\.storage\.local\.get\(\['autofill_enabled'\]/.test(wd),
    'runAutofill trusts a stale snapshot');
  t('  ...treating an unreadable store as OFF',
    /catch \(e\) \{\s*\n\s*this\.enabled = false;/.test(wd), 'a storage failure permits filling');
  t('  ...and honouring the page flag as well',
    /!this\.enabled \|\| window\.__JG_AUTOFILL_DISABLED__ === true/.test(wd),
    'the page-level kill switch is ignored here');
}

console.log('\n6. THE SERVICE WORKER CHECKS BEFORE INJECTING');
{
  t('  injectAutofillEngine reads the toggle',
    /async function injectAutofillEngine[\s\S]{0,1400}chrome\.storage\.local\.get\(\['autofill_enabled'\]/.test(bg),
    'a stale message can inject into a disabled page');
  t('  ...refusing when it is not exactly true',
    /autofill_enabled !== true\) \{[\s\S]{0,160}reason: 'autofill-disabled'/.test(bg),
    'the refusal is missing');
  t('  ...and refusing when the store cannot be read',
    /reason: 'toggle-unreadable'/.test(bg), 'an unreadable store injects anyway');
  t('  registration still reconciles at worker start',
    /chrome\.runtime\.onStartup\.addListener\(syncAutofillRegistrationFromStorage\)/.test(bg)
      && /^syncAutofillRegistrationFromStorage\(\);$/m.test(bg),
    'a persisted registration can outlive an OFF toggle');
}

console.log('\nAND THE GATE BEHAVES, RUN FOR REAL');
{
  // The predicate itself, against every state the flag can hold.
  const disabled = (flag) => {
    const w = {};
    if (flag !== 'unset') w.__JG_AUTOFILL_DISABLED__ = flag;
    return w.__JG_AUTOFILL_DISABLED__ !== false;
  };
  for (const [label, flag, blocked] of [
    ['unset (the race window)', 'unset', true],
    ['true', true, true],
    ['null', null, true],
    ['undefined', undefined, true],
    ['0', 0, true],
    ['"false" as a string', 'false', true],
    ['explicit false', false, false],
  ]) {
    t('  ' + label + ' -> ' + (blocked ? 'BLOCKED' : 'allowed'),
      disabled(flag) === blocked, 'wrong verdict for ' + label);
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
