/**
 * Browsing the LinkedIn job board must apply to NOTHING.
 *
 * The reported failure: "it's wrongfully autofilling on the LinkedIn job
 * board and just randomly searching or reloading different roles."
 *
 * The cause was an automatic path that looked for the Easy Apply button
 * on whatever job the pane happened to be showing and PRESSED it. So
 * reading a results list opened an application on every role that came
 * into view, filled it, advanced it, and -- auto-submit ships ON --
 * submitted it. Applications were reaching employers the user was merely
 * browsing past, and that cannot be undone.
 *
 * The rule is now: autofill only ever continues a dialog the USER opened
 * by pressing Easy Apply. This asserts both halves -- that browsing does
 * nothing at all, and that a real click still produces a complete,
 * submitted application.
 */
const S = require('./support.cjs');
const { chromium } = S.skipUnlessReady(require('path').basename(__filename));
const https = require('https');
const fs = require('fs');

const PORT = 8455;
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const JOBS = ['4001', '4002', '4003', '4004', '4005', '4006'];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Jobs | LinkedIn</title></head>
<body>
<!-- LinkedIn's search filter bar. The "Easy Apply" pill is a button
     whose text is exactly "Easy Apply": it matched the CTA test, was
     clicked, and re-ran the search -- the reported "randomly searching
     or reloading different roles". -->
<div class="search-reusables__filter-bar" role="toolbar">
  <button id="filter-easyapply" class="search-reusables__filter-pill-button"
          aria-pressed="false"><span>Easy Apply</span></button>
  <button id="filter-date" class="search-reusables__filter-pill-button"
          aria-pressed="false"><span>Date posted</span></button>
</div>
<div id="filterclicks" hidden></div>
<div class="scaffold-layout__list"><ul>
${JOBS.map((id) => `<li data-occludable-job-id="${id}" class="jobs-search-results__list-item">
  <a class="job-card-container__link" href="/jobs/view/${id}/">Machine Learning Engineer ${id}</a></li>`).join('\n')}
</ul></div>
<div class="jobs-search__job-details" id="pane"><div class="skeleton">Loading&hellip;</div></div>
<div id="log" hidden></div>
<div id="opened" hidden></div>
<script>
var submitted = [], openedDialogs = [];
var step = 0, openId = null;
function record(){ document.getElementById('log').textContent = JSON.stringify(submitted);
  document.getElementById('opened').textContent = JSON.stringify(openedDialogs); }
var STEPS = [
  { name:'Contact info', next:'Continue to next step', html:
    '<label for="fn">First name</label><input id="fn" aria-required="true">'+
    '<label for="em">Email address</label><input id="em" type="email" aria-required="true">' },
  { name:'Additional questions', next:'Review your application', html:
    '<label for="yrs">How many years of experience do you have?</label><input id="yrs" aria-required="true">'+
    '<label for="auth">Are you legally authorised to work in Ireland?</label>'+
    '<select id="auth" aria-required="true"><option value="">Select an option</option><option>Yes</option><option>No</option></select>' },
  { name:'Review', next:'Submit application', html:'<p>Review your application</p>' },
];
function renderModal(){
  var s = STEPS[step];
  var root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = '<div class="artdeco-modal jobs-easy-apply-modal" role="dialog" data-test-modal aria-label="Apply to Acme">'+
    '<h2>'+s.name+'</h2><form class="jobs-easy-apply-content">'+s.html+'</form>'+
    '<footer><button type="button" aria-label="'+s.next+'"><span>'+s.next+'</span></button></footer></div>';
  root.querySelector('footer button').addEventListener('click', function(){
    if (step === STEPS.length-1){ submitted.push(openId); record(); root.innerHTML=''; step=0; return; }
    step++; setTimeout(renderModal, 100);
  });
}
function openJob(id){
  openId = id; step = 0;
  document.querySelectorAll('li[data-occludable-job-id]').forEach(function(li){
    li.classList.toggle('jobs-search-results-list__list-item--active', li.getAttribute('data-occludable-job-id')===id);
  });
  var pane = document.getElementById('pane');
  pane.innerHTML = '<div class="skeleton">Loading&hellip;</div>';
  setTimeout(function(){
    pane.innerHTML = '<h1 class="job-details-jobs-unified-top-card__job-title"><a href="/jobs/view/'+id+'/">ML Engineer '+id+'</a></h1>'+
      '<div class="job-details-jobs-unified-top-card__container">'+
      '<div class="jobs-apply-button"><button aria-label="Easy Apply to ML Engineer '+id+'">'+
      '<svg class="li-icon"></svg><span>Easy Apply</span></button></div>'+
      '<button id="save-'+id+'" aria-label="Save ML Engineer '+id+'"><span>Save</span></button></div>'+
      '<div id="modal-root"></div>';
    // Pressing Easy Apply is what opens the dialog. Recording every open
    // is how this can tell "the user did it" from "the extension did".
    pane.querySelector('.jobs-apply-button button').addEventListener('click', function(){
      openedDialogs.push(id); record();
      setTimeout(renderModal, 120);
    });
  }, 250);
}
// Record any press of a filter pill, and make it behave like the real
// one: toggling it re-runs the search.
var filterClicks = [];
document.querySelectorAll('.search-reusables__filter-pill-button').forEach(function(b){
  b.addEventListener('click', function(){
    filterClicks.push(b.id);
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    document.getElementById('filterclicks').textContent = JSON.stringify(filterClicks);
  });
});
document.querySelectorAll('a.job-card-container__link').forEach(function(a){
  a.addEventListener('click', function(ev){
    ev.preventDefault();
    openJob(a.getAttribute('href').match(/\\/jobs\\/view\\/(\\d+)/)[1]);
  });
});
setInterval(function(){
  var l = document.querySelector('.scaffold-layout__list ul');
  if (!l) return;
  var g = document.createElement('span'); l.appendChild(g);
  setTimeout(function(){ try { g.remove(); } catch(e){} }, 15);
}, 30);
</script>
</body></html>`;

const server = https.createServer(S.certs(), (q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(PAGE);
});

const PROFILE = {
  first_name: 'Maxmilliam', last_name: 'Okafor',
  email: 'maxokafordev@gmail.com', phone: '+353 87 000 0000',
  city: 'Dublin', country: 'Ireland', years: '6', work_authorized: 'Yes',
};
const LIST_URL = 'https://www.linkedin.com/jobs/search-results/?currentJobId=4001'
  + '&keywords=machine+learning+engineer&start=225';

const read = (page, id) => page.evaluate((i) => {
  try { return JSON.parse(document.getElementById(i).textContent || '[]'); } catch (e) { return []; }
}, id);

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  fs.rmSync('/tmp/pw-liboard', { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext('/tmp/pw-liboard', S.launchOptions(PORT));
  const sw = await S.serviceWorker(ctx);

  // Every switch ON -- the most dangerous configuration, and the default.
  await sw.evaluate((s) => new Promise((r) => chrome.storage.local.set(s, () => r(1))), {
    ats_profile: PROFILE,
    linkedin_autofill_enabled: true,
    linkedin_autoadvance_enabled: true,
    linkedin_autosubmit_enabled: true,
  });

  console.log('BROWSING THE JOB BOARD  (with every toggle ON)\n');
  const page = await ctx.newPage();
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(4000);

  t('landing on the list applies to nothing',
    (await read(page, 'log')).length === 0, JSON.stringify(await read(page, 'log')));
  t('...and opens no application dialog',
    (await read(page, 'opened')).length === 0, JSON.stringify(await read(page, 'opened')));

  // Browse: click through several roles the way a person reads a board.
  for (const id of ['4002', '4003', '4004']) {
    await page.click(`li[data-occludable-job-id="${id}"] a`);
    await page.waitForTimeout(2500);
  }
  const browsedSubmitted = await read(page, 'log');
  const browsedOpened = await read(page, 'opened');
  t('reading three roles submits nothing',
    browsedSubmitted.length === 0,
    'applied to ' + JSON.stringify(browsedSubmitted) + ' while merely browsing');
  t('...and still opens no dialog by itself',
    browsedOpened.length === 0,
    'opened ' + JSON.stringify(browsedOpened) + ' without being asked');
  t('no Easy Apply dialog is on screen',
    !(await page.evaluate(() => !!document.querySelector('.jobs-easy-apply-modal'))));

  // The list is left alone: the extension must not click cards.
  const active = await page.evaluate(() => {
    const el = document.querySelector('.jobs-search-results-list__list-item--active');
    return el ? el.getAttribute('data-occludable-job-id') : null;
  });
  t('the job the user selected is still the one selected',
    active === '4004', 'selection moved to ' + active + ' -- something clicked a card');
  t('the Easy Apply search FILTER was never pressed',
    (await read(page, 'filterclicks')).length === 0,
    'pressed ' + JSON.stringify(await read(page, 'filterclicks'))
      + ' -- clicking the filter re-runs the search, which is the reported '
      + '"randomly searching / reloading different roles"');
  t('...and the filter is still off',
    (await page.evaluate(() => document.getElementById('filter-easyapply').getAttribute('aria-pressed'))) === 'false');

  // Which element does the extension consider the CTA? The filter pill and
  // the real button carry the SAME text, so this is the distinction that
  // matters -- and pressing the wrong one re-runs the search.
  const chosen = await sw.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((x) => x.url === u);
    if (!tab) return { noTab: true };
    const r = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const d = window.__JG_LINKEDIN_DIAGNOSE__ ? window.__JG_LINKEDIN_DIAGNOSE__() : null;
        const el = document.querySelector('.jobs-apply-button button');
        return {
          launchIsInPane: !!(d && d.list && d.list.easyApplyLaunch) && !!el,
          filterPressed: document.getElementById('filter-easyapply').getAttribute('aria-pressed'),
        };
      },
    });
    return (r && r[0] && r[0].result) || {};
  }, LIST_URL);
  t('the CTA it resolves is the in-pane button, not the filter pill',
    chosen.launchIsInPane === true && chosen.filterPressed === 'false',
    JSON.stringify(chosen));

  console.log('\nAFTER THE USER PRESSES EASY APPLY\n');
  await page.click('.jobs-apply-button button');
  await page.waitForTimeout(12000);

  const after = await read(page, 'log');
  t('the application the user started is filled and submitted',
    after.includes('4004'), 'submitted ' + JSON.stringify(after));
  t('and only that one', after.length === 1, JSON.stringify(after));
  t('the dialog was opened once, by the click',
    (await read(page, 'opened')).length === 1, JSON.stringify(await read(page, 'opened')));

  console.log('\nAND NOTHING RESUMES AFTERWARDS\n');
  await page.click('li[data-occludable-job-id="4006"] a');
  await page.waitForTimeout(5000);
  t('moving to another role does not start a new application',
    (await read(page, 'log')).length === 1, JSON.stringify(await read(page, 'log')));
  t('...and does not open one either',
    (await read(page, 'opened')).length === 1, JSON.stringify(await read(page, 'opened')));

  await page.close();
  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed  (LinkedIn job board, real Chromium)');
  await ctx.close();
  server.close();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.log('HARNESS FAILED:', e.stack); process.exit(1); });
