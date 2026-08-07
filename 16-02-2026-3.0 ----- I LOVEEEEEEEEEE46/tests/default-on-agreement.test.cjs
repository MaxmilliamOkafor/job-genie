// A TOGGLE THAT SHIPS ON HAS NO STORED VALUE UNTIL IT IS TOUCHED.
//
// So `storage[key] === true` reads OFF for a switch the interface is
// drawing as ON. Reported twice now:
//
//   background.js registered nothing for LinkedIn until the toggle was
//   flipped by hand, and
//
//   "Fill Easy Apply now" answered "Turn the LinkedIn Easy Apply toggle
//   ON first" against a toggle that was visibly green.
//
// Both halves of that decision live in different files, so they can
// disagree silently. These assert that they cannot.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// The source of truth.
global.window = global;
const core = (() => {
  const file = path.join(DIR, 'autofill-core.js');
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
})();

const canonical = Array.from(core.DEFAULT_ON).sort();
console.log('THE CANONICAL SET  (autofill-core.js)');
console.log('  ' + canonical.join('\n  ') + '\n');
t('it is not empty', canonical.length > 0);

// ---- popup.js must agree ---------------------------------------------
const popupSrc = read('popup.js');
const popupBlock = /async toggleIsOn\(key\) \{[\s\S]*?const DEFAULT_ON = new Set\(\[([\s\S]*?)\]\);/.exec(popupSrc);
console.log('POPUP');
t('the popup has a shared toggle reader', !!popupBlock,
  'runSiteAutofill reads storage directly again -- that is how this broke');
if (popupBlock) {
  const popupKeys = (popupBlock[1].match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, '')).sort();
  t('the popup\'s default-on set matches autofill-core exactly',
    JSON.stringify(popupKeys) === JSON.stringify(canonical),
    'popup: ' + JSON.stringify(popupKeys) + '\n              core:  ' + JSON.stringify(canonical));
}
t('the run button no longer demands === true',
  !/chrome\.storage\.local\.get\(\[cfg\.key\][\s\S]{0,120}?=== true/.test(popupSrc),
  'a default-on toggle would read as off and refuse to run');
t('...and goes through the shared reader',
  /const enabled = await this\.toggleIsOn\(cfg\.key\);/.test(popupSrc));

// ---- the UI renders them with the same rule --------------------------
console.log('\nTHE UI');
for (const key of canonical) {
  if (key === 'followup_enabled') continue;      // rendered in its own panel
  const re = new RegExp('\\.checked = (?:result|r|st)\\.' + key + ' !== false');
  t(key + ' renders on unless explicitly false', re.test(popupSrc),
    'the switch would draw OFF while the feature is ON, or the reverse');
}

// ---- background.js agrees --------------------------------------------
console.log('\nBACKGROUND');
const bg = read('background.js');
// LinkedIn Easy Apply autofill is OPT-IN, so the service worker must read
// it as off until it is explicitly on -- the opposite of the default-on
// rule above, and the reason both directions are tested here.
t('LinkedIn registration is opt-in',
  /linkedin_autofill_enabled\s*===\s*true/.test(bg),
  'the filler would register on linkedin.com without being switched on');
t('...and it is not in the default-on set either',
  !core.DEFAULT_ON.has('linkedin_autofill_enabled'),
  'the page would treat it as on while the worker treated it as off');

// ---- and the opt-in ones stay opt-in ---------------------------------
// The mirror risk: treating everything as default-on would silently arm
// features the user never asked for.
console.log('\nOPT-IN PREFERENCES STAY OPT-IN');
t('the master autofill switch is NOT default-on',
  !core.DEFAULT_ON.has('autofill_enabled'),
  'the heavy vendor engine would load everywhere without being asked');
t('...and is read with === true',
  /autofill_enabled\s*===\s*true/.test(bg),
  'it would arm itself by default');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
