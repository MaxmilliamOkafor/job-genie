// A LINKED GMAIL ACCOUNT STAYS LINKED.
//
// The implicit flow hands back a token that lasts about an hour. The
// authorisation behind it lasts until the user revokes it, so the hourly
// expiry should be invisible: Google reissues silently for prompt=none
// and nobody sees a window.
//
// It was not invisible. Signing in kept "timing out" and the account
// chooser kept coming back, for two reasons that compound:
//
//   1. No login_hint. With more than one Google account signed in --
//      which is the normal case, and is exactly what the reported
//      screenshot showed -- prompt=none cannot decide which account it
//      is being asked about. Google refuses with
//      account_selection_required rather than guessing, so EVERY silent
//      reissue failed and every hour became a manual reconnect.
//
//   2. prompt=consent hard-coded on the interactive path. That forces
//      the full consent screen even when the grant is already on file.
//      In the implicit flow it buys nothing at all -- there is no
//      refresh token to force out of Google -- so its only effect was
//      to make a working connection look broken.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');

// chrome.storage stub -- the module reads config through it at load time.
const store = {};
global.chrome = {
  storage: { local: {
    get: (keys, cb) => {
      const out = {};
      for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
      cb(out);
    },
    set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
    remove: (keys, cb) => { for (const k of [].concat(keys)) delete store[k]; cb && cb(); },
  } },
  runtime: { lastError: null, getManifest: () => ({}) },
  identity: {},
};
global.window = global;
(() => {
  const f = path.join(DIR, 'followup-email.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(f, 'utf8'), f);
})();
const FE = global.FollowupEmail;
const CID = '347441388702-example.apps.googleusercontent.com';
const URI = 'https://abcdef.chromiumapp.org/';
const q = (url, k) => new URLSearchParams(url.split('?')[1] || '').get(k);

console.log('THE SILENT REISSUE NAMES THE ACCOUNT');
const silent = FE.buildAuthUrl(CID, URI, 'none', 'maxokafordev@gmail.com');
t('  prompt=none is still asked for', q(silent, 'prompt') === 'none', silent);
t('  ...and login_hint carries the account',
  q(silent, 'login_hint') === 'maxokafordev@gmail.com',
  'without this, a second signed-in Google account makes every silent '
    + 'reissue fail with account_selection_required');
t('  the scope is unchanged', q(silent, 'scope') === 'https://www.googleapis.com/auth/gmail.send',
  'sending mail is the only thing this needs to do');

console.log('\nAND NOTHING IS RE-CONSENTED THAT WAS ALREADY GRANTED');
const relink = FE.buildAuthUrl(CID, URI, '', 'maxokafordev@gmail.com');
t('  no prompt parameter at all once linked', q(relink, 'prompt') === null, relink);
t('  ...but the account is still named', q(relink, 'login_hint') === 'maxokafordev@gmail.com', relink);
const first = FE.buildAuthUrl(CID, URI, 'select_account', '');
t('  a first link asks to choose an account', q(first, 'prompt') === 'select_account', first);
t('  ...and never asks for consent explicitly',
  q(first, 'prompt') !== 'consent',
  'prompt=consent re-shows the permission screen on every single connect');
t('  an unknown account omits the hint rather than sending an empty one',
  q(first, 'login_hint') === null, first);

console.log('\nTHE HINT FALLS BACK TO THE PROFILE EMAIL');
// A user who has never opened the Gmail settings still gets a working
// silent reissue, because the address is already on their profile.
(async () => {
  t('  empty when nothing is known', (await FE.loadAccountHint()) === '');
  store.ats_profile = { email: 'maxokafordev@gmail.com' };
  t('  uses the profile email', (await FE.loadAccountHint()) === 'maxokafordev@gmail.com');
  await FE.saveAccountHint('other@gmail.com');
  t('  an explicit choice wins over the profile',
    (await FE.loadAccountHint()) === 'other@gmail.com',
    'a user whose Gmail differs from their profile address must be able to say so');

  console.log('\nAND THE SOURCE DOES NOT REGRESS TO THE OLD BEHAVIOUR');
  const src = fs.readFileSync(path.join(DIR, 'followup-email.js'), 'utf8');
  t('  prompt=consent is not hard-coded anywhere',
    !/buildAuthUrl\([^)]*'consent'/.test(src),
    'that is the line that made every reconnect show the consent screen');
  t('  the silent path passes a hint',
    /buildAuthUrl\(clientId, uri, 'none', await loadAccountHint\(\)\)/.test(src),
    'without the hint prompt=none cannot resolve a multi-account session');

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
