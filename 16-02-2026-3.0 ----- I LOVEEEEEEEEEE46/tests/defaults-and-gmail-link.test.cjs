// Two preferences that cost the user time on every single session:
// toggles that ship OFF and have to be switched on, and a Gmail
// connection that reports itself lost every time its hourly token expires.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(DIR,f),'utf8');
const popupJs=read('popup.js'), core=read('autofill-core.js'), bg=read('background.js'), fu=read('followup-email.js');

const DEFAULT_ON = [
  'linkedin_autoadvance_enabled',
  'linkedin_autosubmit_enabled',
  'followup_enabled',
];

// LinkedIn Easy Apply autofill is OPT-IN: nothing of ours touches an
// application dialog until the user switches it on. The two LinkedIn
// toggles above only ever apply once it is, since runAutoFlow checks it
// first, so they cannot act on their own.
const OPT_IN = ['linkedin_autofill_enabled'];

console.log('OPT-IN');
for (const k of OPT_IN) {
  t(k + ' is NOT in the default-on set',
    !new RegExp("'" + k + "'").test((/const DEFAULT_ON = new Set\(\[[\s\S]*?\]\);/.exec(core)||[''])[0]),
    'it would arm itself without being asked');
  t(k + ' is read with === true, so unset means off',
    new RegExp('\\b' + k + '\\s*===\\s*true').test(bg),
    'the service worker would register the filler by default');
}
t('the popup shows it OFF until switched on',
  /liToggle\.checked = result\.linkedin_autofill_enabled === true/.test(popupJs),
  'the switch would draw ON while the feature is off');

// ---- 1. the rest ship ON, in every context that reads them ------------
for (const k of DEFAULT_ON) {
  t(k + ' is declared default-on for content scripts',
    new RegExp("'" + k + "'").test((/const DEFAULT_ON = new Set\(\[[\s\S]*?\]\);/.exec(core)||[''])[0]),
    'content script would still read it as off');
  // A default expressed in one place and not another is how a toggle ends
  // up ON in the popup and OFF in the page.
  t(k + ' is not read with === true anywhere',
    !new RegExp('\\b' + k + '\\s*===\\s*true').test(popupJs + core + bg),
    'a reader still treats unset as off');
}
t('the shared reader honours the default-on set',
  /DEFAULT_ON\.has\(key\) \? v !== false : v === true/.test(core), 'isToggleOn ignores the set');
// The service worker only decides ONE of these: whether to register the
// LinkedIn filler at all. The rest are read in the page, by isToggleOn.
t('the service worker gates registration on the opt-in toggle',
  /linkedin_autofill_enabled\s*===\s*true/.test(bg),
  'it would register the filler on linkedin.com without being asked');
t('and the master autofill switch stays opt-in too',
  /autofill_enabled\s*===\s*true/.test(bg),
  'the heavy vendor engine would arm itself');

// Turning something OFF must survive. "Unset means on" would undo it.
t('an explicit false still wins over the default',
  /An explicit false always wins/.test(core) && /v !== false/.test(core), 'off would not stick');
t('a storage failure does not silently enable auto-submit',
  /resolve\(false\);[\s\S]{0,120}\}\s*\);\s*\}/.test(core.slice(core.indexOf('function isToggleOn'))),
  'a failed read must not start submitting applications');

// The popup restores them the same way.
for (const [id,key] of [['advToggle','linkedin_autoadvance_enabled'],
                        ['subToggle','linkedin_autosubmit_enabled'],['fuToggle','followup_enabled']]) {
  t('the popup shows ' + key + ' as on by default',
    new RegExp(id + '\\.checked = result\\.' + key + ' !== false').test(popupJs), 'shows off on first open');
}

// Auto-submit still requires auto-advance, which is a safety interlock.
t('auto-submit still depends on auto-advance',
  /if \(!enabled\) patch\.linkedin_autosubmit_enabled = false;/.test(popupJs),
  'submitting without advancing makes no sense');

// The auto-send gate must not re-introduce an off-by-default.
t('the auto-send gate treats unset as enabled',
  /cfg\.followup_enabled === false/.test(popupJs), 'would skip sending until toggled');

// ---- 2. Gmail stays connected until disconnected ---------------------
t('the link is stored separately from the token',
  /KEY_LINKED/.test(fu) && /followup_gmail_linked/.test(fu), 'status would follow the hourly token');
t('connecting records the link', /async function connect\(\)[\s\S]{0,200}_setLinked\(true/.test(fu));
t('disconnecting clears it', /function disconnect\(\)[\s\S]{0,120}_setLinked\(false\)/.test(fu));
t('isConnected reports the link, not a live token',
  /async function isConnected\(opts\)[\s\S]{0,200}isLinked\(\)/.test(fu), 'an expired token would read as disconnected');
t('a live token can still be checked when it matters',
  /function hasLiveToken\(\)/.test(fu) && /hasLiveToken/.test(popupJs));
t('an existing token from an earlier setup is adopted, not discarded',
  /Never linked through this path[\s\S]{0,400}_setLinked\(true/.test(fu), 'would ask an already-connected user to reconnect');

// The link must only drop on a REAL revocation, never on ordinary expiry.
const sendFn=(/async function send\(\{ to, subject, body, fromName, attachments \}\)[\s\S]*?\n  \}/m.exec(fu)||[''])[0];
t('a 401 tries a silent reissue before giving up',
  /getAuthToken\(false\)[\s\S]{0,80}recovered/.test(sendFn), 'an hourly expiry would unlink');
t('the link drops only when the reissue also fails',
  /if \(!recovered\) await _setLinked\(false\)/.test(sendFn), 'either never unlinks, or unlinks too eagerly');

t('isLinked and hasLiveToken are exported', /isConnected, isLinked, hasLiveToken, connect, disconnect/.test(fu));

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
