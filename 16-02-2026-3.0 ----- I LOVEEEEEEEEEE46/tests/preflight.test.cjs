// The preflight is the answer to "which step is broken?", so its own
// correctness matters more than most: a check that calls a function which
// does not exist reports a false failure and sends someone fixing the
// wrong thing.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(DIR,f),'utf8');
const popupJs=read('popup.js'), popupHtml=read('popup.html');
const fu=read('followup-email.js'), enrich=read('contact-enrichment.js');
const mem=read('linkedin-profile-memory.js');

const fn=(/  async followupPreflight\(\) \{[\s\S]*?\n  \}/m.exec(popupJs)||[''])[0];
t('the preflight exists', !!fn);
t('it is reachable from the panel',
  /id="followupPreflightBtn"/.test(popupHtml)
  && /getElementById\('followupPreflightBtn'\)\?\.addEventListener/.test(popupJs));

// Every precondition that can silently stop a follow-up.
for (const [what, re] of [
  ['modules loaded', /Modules not loaded/],
  ['the master toggle', /followup_enabled/],
  ['the attachment toggle', /followup_attach_enabled/],
  ['Gmail', /Gmail not connected/],
  ['a detected job', /No job detected/],
  ['generated documents', /followupAttachments\(\)/],
  ['a recipient', /Recipient/],
  ['the lookup config', /ContactEnrichment\.loadConfig/],
  ['provider credentials', /getCred/],
  ['LinkedIn handles', /followupProfileHandles\(\)/],
  ['page readability', /followupHarvestPageSources\(\)/],
  ['what happened last time', /followup_last_outcome/],
]) t('checks ' + what, re.test(fn), 'not covered');

// Every cross-module call the preflight makes must actually exist. This is
// the check that catches calling a function by a name it does not have.
const EXPORTS = {
  'FollowupEmail': fu, 'ContactEnrichment': enrich, 'JGProfileMemory': mem,
};
let calls = [...fn.matchAll(/\b(FollowupEmail|ContactEnrichment|JGProfileMemory)\.(\w+)\(/g)];
t('the preflight calls other modules at all', calls.length > 0, String(calls.length));
for (const [, mod, method] of calls) {
  const src = EXPORTS[mod];
  // Exported in the public object, or defined as a function in the module.
  const exported = new RegExp('(^|[,{\\s])' + method + '\\s*[,}]', 'm').test(src)
    || new RegExp('function\\s+' + method + '\\b').test(src)
    || new RegExp('\\b' + method + '\\s*[:=]\\s*(async\\s*)?(function|\\()').test(src);
  t(mod + '.' + method + ' exists', exported, 'no such export - would throw at runtime');
}

// Same check for the methods it calls on itself.
const selfCalls = [...new Set([...fn.matchAll(/this\.(\w+)\(/g)].map((m) => m[1]))];
for (const name of selfCalls) {
  const defined = new RegExp('\\n  (async )?' + name + '\\s*\\(').test(popupJs);
  t('this.' + name + ' is defined', defined, 'would throw at runtime');
}

// It must be safe to run at any time.
t('it sends nothing', !/followupSend|FollowupEmail\.send\(/.test(fn), 'a check must not send mail');
t('it spends no provider credits', !/findContacts|bestEmail|resolveProfile/.test(fn),
  'a check must not consume credits');
t('a failure in the check cannot break the popup', /catch \(e\)/.test(fn));

// Each blocker has to say what to do about it.
const stops=[...fn.matchAll(/bad\('([^']+)'/g)].length;
const fixes=(fn.match(/fix:/g)||[]).length + [...fn.matchAll(/bad\([^,]+,\s*\n?\s*'/g)].length;
t('every blocker carries a fix', stops>0 && fixes>0, stops+' blockers, '+fixes+' fixes');
t('it ends with a verdict', /No blockers|blocker\(s\) above/.test(fn));

// ---- the same check, across the whole popup ---------------------------
// Calling a module function by a name it does not export throws at
// runtime and, in a try/catch, becomes a silent skip. Static checking is
// the only way to catch it without a browser.
const MODULES = {
  FollowupEmail: fu,
  ContactEnrichment: enrich,
  JGProfileMemory: mem,
  JDContactExtractor: read('jd-contact-extractor.js'),
  JDContactSources: read('jd-contact-sources.js'),
};
const exists = (src, method) =>
  new RegExp('(^|[,{\\s])' + method + '\\s*[,}]', 'm').test(src)
  || new RegExp('function\\s+' + method + '\\b').test(src)
  || new RegExp('\\b' + method + '\\s*[:=]\\s*(async\\s*)?(function|\\()').test(src);

const bad = [];
let checked = 0;
for (const [mod, src] of Object.entries(MODULES)) {
  const re = new RegExp('\\b' + mod + '\\.(\\w+)\\(', 'g');
  for (const [, method] of popupJs.matchAll(re)) {
    checked++;
    if (!exists(src, method)) bad.push(mod + '.' + method);
  }
}
t('every module call in popup.js resolves to a real export',
  bad.length === 0, 'missing: ' + [...new Set(bad)].join(', '));
t('the scan actually found calls to check', checked > 10, String(checked) + ' calls');

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
