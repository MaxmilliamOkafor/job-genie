// AUTOFILL FIRED ON A GITHUB SETTINGS PAGE.
//
// github.com/<user>/<repo>/settings: a page full of forms and a file
// input (the social-preview upload), on a site that is never where a
// job application is filled in. The eligibility gate judges pages by
// their form signals, and sites like GitHub carry those signals on
// every second page -- so never-ATS hosts are DENYLISTED outright,
// where the controller self-disables before any heuristic runs.
//
// Two copies of the list exist by design (the content script cannot
// import from the service worker), which is exactly how they drift.
// This file pins both, and pins them to each other.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(DIR, 'autofill-controller.js'), 'utf8');
const background = fs.readFileSync(path.join(DIR, 'background.js'), 'utf8');

const listOf = (src, name) => {
  const m = src.match(new RegExp(name + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
const ctl = listOf(controller, 'DENYLIST_HOSTS');
const bg = listOf(background, 'AUTOFILL_DENYLIST_HOSTS');

console.log('THE NEVER-ATS HOSTS ARE DENIED IN BOTH LAYERS');
t('  both lists parse', !!ctl && !!bg, JSON.stringify({ ctl: !!ctl, bg: !!bg }));
for (const host of ['github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
  'reddit.com', 'youtube.com', 'x.com', 'facebook.com', 'wikipedia.org',
  'docs.google.com', 'mail.google.com', 'console.aws.amazon.com', 'localhost']) {
  t('  ' + host + ' in the controller', !!ctl && ctl.indexOf(host) !== -1, JSON.stringify(ctl));
  t('  ' + host + ' in the background', !!bg && bg.indexOf(host) !== -1, JSON.stringify(bg));
}

console.log('\nAND THE TWO LISTS CANNOT DRIFT');
{
  const a = (ctl || []).slice().sort().join(',');
  const b = (bg || []).slice().sort().join(',');
  t('  controller and background lists are identical', a === b,
    'only in controller: ' + (ctl || []).filter((h) => (bg || []).indexOf(h) === -1).join(', ')
    + ' | only in background: ' + (bg || []).filter((h) => (ctl || []).indexOf(h) === -1).join(', '));
}

console.log('\nAND LEGITIMATE CAREER PATHS ARE NOT CAUGHT');
{
  // The match rule is host === h or host.endsWith('.' + h). These must
  // all stay reachable.
  const denied = (host) => (ctl || []).some((h) => host === h || host.endsWith('.' + h));
  for (const ok of ['boards.greenhouse.io', 'caylent.wd1.myworkdayjobs.com',
    'careers.google.com', 'www.amazon.jobs', 'jobs.lever.co']) {
    t('  ' + ok + ' is still allowed', !denied(ok), 'a real ATS host got denied');
  }
  t('  ...but gist.github.com is denied like github.com itself', denied('gist.github.com'),
    'subdomain matching broke');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
