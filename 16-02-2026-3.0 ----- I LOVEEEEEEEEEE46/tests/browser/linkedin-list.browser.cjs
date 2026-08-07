/**
 * The LinkedIn results list, in a real browser.
 *
 * Reported: on /jobs/search-results/ the autofill "does absolutely
 * nothing" -- it never clicks into the individual roles, never runs Easy
 * Apply, and bogs the page down.
 *
 * Three causes, all reproduced here:
 *   1. Nothing walked the list. Every flow acted on the job that was
 *      already OPEN, and on a search-results page none is: the right pane
 *      is a skeleton until a card is clicked.
 *   2. currentJobId() fell back to location.pathname, identical for every
 *      job on that page, so the "already attempted" guard marked the
 *      whole list after one try.
 *   3. findEasyApplyModal() -- a multi-selector sweep -- ran on EVERY
 *      mutation, and the list mutates continuously as cards virtualise.
 *
 * The fixture is a split-pane list: cards carrying
 * data-occludable-job-id, a right pane that renders only when a card is
 * clicked, and a four-step Easy Apply dialog per job. Two of the six jobs
 * are external "Apply" rather than Easy Apply, and must be skipped.
 */
const S = require('./support.cjs');
const { chromium } = S.skipUnlessReady(require('path').basename(__filename));
const https = require('https');
const fs = require('fs');

const PORT = 8451;
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

// jobId -> easyApply?
const JOBS = [
  ['4001', true], ['4002', true], ['4003', false],
  ['4004', true], ['4005', false], ['4006', true],
];
const EASY_IDS = JOBS.filter((j) => j[1]).map((j) => j[0]);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Jobs | LinkedIn</title></head>
<body>
<div class="scaffold-layout__list"><ul>
${JOBS.map(([id]) => `<li data-occludable-job-id="${id}" class="jobs-search-results__list-item">
  <a class="job-card-container__link" href="/jobs/view/${id}/">Machine Learning Engineer ${id}</a>
  <div>Acme ${id}</div></li>`).join('\n')}
</ul></div>
<div class="jobs-search__job-details" id="pane"><div class="skeleton">Loading…</div></div>
<div id="log" hidden></div>
<script>
var JOBS = ${JSON.stringify(Object.fromEntries(JOBS))};
var submitted = [];
var step = 0, openId = null;
function record(s){ var l=document.getElementById('log'); l.textContent = JSON.stringify(submitted); }
var STEPS = [
  { name:'Contact info', next:'Continue to next step', html:
    '<label for="fn">First name</label><input id="fn" aria-required="true">'+
    '<label for="em">Email address</label><input id="em" type="email" aria-required="true">' },
  { name:'Additional questions', next:'Continue to next step', html:
    '<label for="yrs">How many years of experience do you have?</label><input id="yrs" aria-required="true">'+
    '<label for="auth">Are you legally authorised to work in Ireland?</label>'+
    '<select id="auth" aria-required="true"><option value="">Select an option</option><option>Yes</option><option>No</option></select>' },
  { name:'Screening', next:'Review your application', html:
    '<label for="spon">Will you now or in the future require sponsorship?</label>'+
    '<select id="spon" aria-required="true"><option value="">Select an option</option><option>Yes</option><option>No</option></select>' },
  { name:'Review', next:'Submit application', html:'<p>Review your application</p>' },
];
function renderModal(){
  var s = STEPS[step];
  var root = document.getElementById('modal-root');
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
  history.replaceState({},'', '/jobs/search-results/?currentJobId='+id);
  document.querySelectorAll('li[data-occludable-job-id]').forEach(function(li){
    li.classList.toggle('jobs-search-results-list__list-item--active', li.getAttribute('data-occludable-job-id')===id);
  });
  var pane = document.getElementById('pane');
  // The pane arrives asynchronously, as LinkedIn's does.
  pane.innerHTML = '<div class="skeleton">Loading…</div>';
  setTimeout(function(){
    pane.innerHTML = '<h1 class="job-details-jobs-unified-top-card__job-title">Machine Learning Engineer '+id+'</h1>'+
      '<a href="/jobs/view/'+id+'/">permalink</a>'+
      (JOBS[id]
        ? '<button class="jobs-apply-button" aria-label="Easy Apply to Machine Learning Engineer '+id+'"><span>Easy Apply</span></button>'
        : '<button class="jobs-apply-button" aria-label="Apply to Machine Learning Engineer '+id+'"><span>Apply</span></button>')+
      '<div id="modal-root"></div>';
    var b = pane.querySelector('.jobs-apply-button');
    if (JOBS[id]) b.addEventListener('click', function(){ setTimeout(renderModal, 120); });
  }, 300);
}
document.querySelectorAll('a.job-card-container__link').forEach(function(a){
  a.addEventListener('click', function(ev){
    ev.preventDefault();
    openJob(a.getAttribute('href').match(/\\/jobs\\/view\\/(\\d+)/)[1]);
  });
});
// Cards virtualising in and out: the mutation storm that made the sweep
// on every mutation unusable.
setInterval(function(){
  var l = document.querySelector('.scaffold-layout__list ul');
  if (!l) return;
  var ghost = document.createElement('span');
  l.appendChild(ghost);
  setTimeout(function(){ try { ghost.remove(); } catch(e){} }, 15);
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
const LIST_URL = 'https://www.linkedin.com/jobs/search-results/?keywords=machine+learning+engineer';

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  fs.rmSync('/tmp/pw-lilist', { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext('/tmp/pw-lilist', S.launchOptions(PORT));
  const sw = await S.serviceWorker(ctx);

  const setState = (s) => sw.evaluate(
    (x) => new Promise((res) => chrome.storage.local.set(x, () => res(1))), s);
  const getApplied = () => sw.evaluate(
    () => new Promise((res) => chrome.storage.local.get(['linkedin_applied_jobs'], (r) => res(r.linkedin_applied_jobs || {}))));

  await setState({
    ats_profile: PROFILE,
    linkedin_autofill_enabled: true,
    linkedin_autoadvance_enabled: true,
    linkedin_autosubmit_enabled: true,
    linkedin_applied_jobs: {},
  });

  // ---- 1. it works through the list on its own ------------------------
  let page = await ctx.newPage();
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  // Wait for the sweep to FINISH rather than guessing a duration: poll
  // until the tally stops growing. A fixed timeout silently truncates the
  // run and reports the last job as a failure that never happened.
  const readLog = () => page.evaluate(() => {
    try { return JSON.parse(document.getElementById('log').textContent || '[]'); } catch (e) { return []; }
  });
  let submitted = [];
  let stableFor = 0;
  for (let waited = 0; waited < 90000 && stableFor < 12000; waited += 1000) {
    await page.waitForTimeout(1000);
    const now = await readLog();
    stableFor = (now.length === submitted.length) ? stableFor + 1000 : 0;
    submitted = now;
  }
  console.log('SEARCH RESULTS LIST\n');
  t('it applied to jobs without being told which',
    submitted.length > 0, 'nothing was applied to -- the reported failure');
  t('it applied to every Easy Apply role in the list',
    EASY_IDS.every((id) => submitted.includes(id)),
    'submitted ' + JSON.stringify(submitted) + ', expected all of ' + JSON.stringify(EASY_IDS));
  t('it skipped the external-apply roles',
    !submitted.includes('4003') && !submitted.includes('4005'),
    'applied to a role that was not Easy Apply: ' + JSON.stringify(submitted));
  t('it applied to each role exactly once',
    new Set(submitted).size === submitted.length, JSON.stringify(submitted));

  // ---- 2. the page stays usable --------------------------------------
  const responsive = await page.evaluate(async () => {
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    return performance.now() - t0;
  });
  t('the page is still responsive under the mutation storm',
    responsive < 1500, responsive.toFixed(0) + 'ms for five frames');
  await page.close();

  // ---- 3. it never applies to the same job twice ----------------------
  const applied = await getApplied();
  t('applications are remembered across runs',
    EASY_IDS.every((id) => applied[id]), JSON.stringify(Object.keys(applied)));

  page = await ctx.newPage();
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(9000);
  const again = await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('log').textContent || '[]'); } catch (e) { return []; }
  });
  t('a second visit does not re-apply to anything',
    again.length === 0,
    're-applied to ' + JSON.stringify(again) + ' -- recruiters see every duplicate');
  await page.close();

  // ---- 4. with auto-submit OFF nothing is ever submitted --------------
  await setState({ linkedin_autosubmit_enabled: false, linkedin_applied_jobs: {} });
  page = await ctx.newPage();
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(14000);
  const noSubmit = await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('log').textContent || '[]'); } catch (e) { return []; }
  });
  t('with auto-submit OFF, nothing is submitted',
    noSubmit.length === 0, 'submitted ' + JSON.stringify(noSubmit) + ' with the toggle off');
  await page.close();

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed  (LinkedIn results list, real Chromium)');
  await ctx.close();
  server.close();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.log('HARNESS FAILED:', e.stack); process.exit(1); });
