// WHAT THE EXTENSION COSTS WHILE YOU JUST USE LINKEDIN.
//
// Asked directly: "hopefully my extension doesn't start messing up and
// malfunctioning when I am gradually using linkedin?"
//
// The failure that question describes is not a crash. It is steady cost
// on every page you spend time on, which shows up as the site getting
// heavier the longer it is open. Two sources of exactly that:
//
//   THE OBSERVER RAN SITE-WIDE. The script is registered for
//   linkedin.com/*, and the lifecycle guard read
//       isLinkedInJobsPage() || location.hostname.endsWith('linkedin.com')
//   whose second half is always true on LinkedIn. So the MutationObserver
//   watched the feed, messaging, notifications and profiles for the whole
//   session, sweeping the DOM on an infinite-scroll page that never stops
//   mutating, to look for a dialog that cannot exist there.
//
//   IDLE WAS TRACED EVERY TIME. "No dialog open" is the normal state, and
//   recording it on every pass wrote to chrome.storage every few hundred
//   milliseconds for as long as LinkedIn was open.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'linkedin-autofill.js'), 'utf8');

// ---- the section test -------------------------------------------------
console.log('THE WATCHER IS SCOPED TO THE JOBS SECTION');
t('the always-true lifecycle guard is gone',
  !/isLinkedInJobsPage\(\) \|\| location\.hostname\.endsWith\('linkedin\.com'\)/.test(src),
  'the observer would run on the feed, messaging and profiles all session');
t('there is a jobs-section test', /function onJobsSection\(\)/.test(src));

const fn = /function onJobsSection\(\) \{([\s\S]*?)\n  \}/.exec(src)[1];
const onJobs = new Function('location', 'return (function(){' + fn + '})();');
for (const [p, want] of [
  ['/jobs/search-results/', true],
  ['/jobs/view/4449152363/', true],
  ['/jobs/', true],
  ['/jobs', true],
  ['/feed/', false],
  ['/messaging/thread/2-abc/', false],
  ['/in/maxmilliam-okafor/', false],
  ['/mynetwork/', false],
  ['/notifications/', false],
  ['/', false],
]) {
  t('  ' + p + ' -> ' + (want ? 'watch' : 'quiet'),
    onJobs({ pathname: p }) === want, String(onJobs({ pathname: p })));
}

console.log('\nAND IT DETACHES WHEN YOU LEAVE');
t('there is an unwatch that disconnects the observer',
  /function unwatch\(\)[\s\S]{0,300}?_obs\.disconnect\(\)/.test(src),
  'leaving the jobs section would leave the observer running');
t('...which also cancels any pending run',
  /function unwatch\(\)[\s\S]{0,400}?clearTimeout\(_debounce\)/.test(src));
t('the lifecycle re-checks on SPA navigation',
  /location\.pathname === lastPath/.test(src) && /syncLifecycle\('spa-nav'\)/.test(src),
  'LinkedIn never reloads, so the section change would be missed');
t('the observer is never attached twice',
  /if \(!document\.body \|\| _obs\) return;/.test(src),
  'repeated navigation would stack observers');

// ---- the trace must not churn ----------------------------------------
console.log('\nIDLE IS NOT WRITTEN TO STORAGE OVER AND OVER');
t('an unchanged idle state is recorded once',
  /const idleKey = reason \+ '\|' \+ \(currentJobId\(\) \|\| ''\);[\s\S]{0,200}?if \(idleKey !== _lastIdleKey\)/.test(src),
  'every pass would write to storage');
t('...and the trace buffer is still bounded',
  /_traceBuf\.length > TRACE_MAX/.test(src) && /slice\(-TRACE_MAX\)/.test(src));

// ---- and nothing runs on its own anyway ------------------------------
console.log('\nNOTHING ACTS WITHOUT AN OPEN DIALOG');
t('the automatic path still returns unless a dialog is open',
  /const open = findEasyApplyModal\(\);[\s\S]{0,200}?if \(!open\) \{[\s\S]{0,1200}?return;/.test(src),
  'the activation rule regressed');
t('and the per-job guard resets on navigation rather than growing',
  /_attempted\.clear\(\)/.test(src),
  'the attempted set would grow for the whole session');

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
